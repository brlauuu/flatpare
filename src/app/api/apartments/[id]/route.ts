import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  apartments,
  apartmentDistances,
  ratings,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { and, eq } from "drizzle-orm";
import {
  assertMembership,
  ForbiddenError,
  UnauthorizedError,
} from "@/lib/household";
import { requireHousehold } from "@/lib/session";
import { buildMapEmbedUrl } from "@/lib/map-embed";
import { isIsoDate } from "@/lib/iso-date";
import { diffInferableFields } from "@/lib/edited-fields";
import { geocodeLatLng } from "@/lib/geocode";

const notFound = () =>
  NextResponse.json({ error: "Not found" }, { status: 404 });
const notAuthenticated = () =>
  NextResponse.json({ error: "Not authenticated" }, { status: 401 });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let householdId: number;
  try {
    ({ householdId } = await requireHousehold());
  } catch (e) {
    if (e instanceof UnauthorizedError) return notAuthenticated();
    throw e;
  }

  try {
    const { id } = await params;
    const apartmentId = parseInt(id);
    if (!Number.isInteger(apartmentId)) return notFound();

    // Scoped by the SESSION's household, never by a household read off the
    // row itself: checking request-derived data against request-derived data
    // is a no-op. A row in another household is simply "not found" — a 403
    // would confirm it exists.
    const apartment = await db
      .select()
      .from(apartments)
      .where(
        and(
          eq(apartments.id, apartmentId),
          eq(apartments.householdId, householdId)
        )
      )
      .limit(1);

    if (apartment.length === 0) return notFound();

    // Ratings are keyed on userId (Task 1 of this epic moved off userName
    // as the identity key, since names aren't unique across OAuth accounts
    // and can be null). The left join resolves a display name for the UI;
    // callers must still key identity on userId, never on the joined name.
    const apartmentRatings = await db
      .select({
        id: ratings.id,
        userId: ratings.userId,
        userName: users.name,
        kitchen: ratings.kitchen,
        balconies: ratings.balconies,
        location: ratings.location,
        floorplan: ratings.floorplan,
        overallFeeling: ratings.overallFeeling,
        comment: ratings.comment,
      })
      .from(ratings)
      .leftJoin(users, eq(ratings.userId, users.id))
      .where(
        and(
          eq(ratings.apartmentId, apartmentId),
          eq(ratings.householdId, householdId)
        )
      );

    const distances = await db
      .select({
        locationId: apartmentDistances.locationId,
        bikeMin: apartmentDistances.bikeMin,
        transitMin: apartmentDistances.transitMin,
      })
      .from(apartmentDistances)
      .where(
        and(
          eq(apartmentDistances.apartmentId, apartmentId),
          eq(apartmentDistances.householdId, householdId)
        )
      );

    return NextResponse.json({
      ...apartment[0],
      ratings: apartmentRatings,
      distances,
      mapEmbedUrl: buildMapEmbedUrl(apartment[0].address),
    });
  } catch (error) {
    console.error("[apartments/id:GET] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch apartment" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let householdId: number;
  let userId: string;
  try {
    ({ householdId, userId } = await requireHousehold());
  } catch (e) {
    if (e instanceof UnauthorizedError) return notAuthenticated();
    throw e;
  }

  // The JWT carries a householdId that stays valid for up to 24h, so a removed
  // member's token still names their old household. Reads may trust it;
  // writes re-check the database.
  try {
    await assertMembership(householdId, userId);
  } catch (e) {
    if (e instanceof ForbiddenError) return notFound();
    throw e;
  }

  try {
    const { id } = await params;
    const apartmentId = parseInt(id);
    if (!Number.isInteger(apartmentId)) return notFound();
    const scope = and(
      eq(apartments.id, apartmentId),
      eq(apartments.householdId, householdId)
    );
    const body = await request.json();

    const availableFrom: string | null =
      typeof body.availableFrom === "string" && isIsoDate(body.availableFrom)
        ? body.availableFrom
        : null;

    const currentRows = await db
      .select()
      .from(apartments)
      .where(scope)
      .limit(1);

    if (currentRows.length === 0) return notFound();

    const previousEdited: string[] = (() => {
      const raw = currentRows[0].userEditedFields;
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
          ? parsed.filter((v): v is string => typeof v === "string")
          : [];
      } catch {
        return [];
      }
    })();

    const newlyChanged = diffInferableFields(
      currentRows[0] as Record<string, unknown>,
      body as Record<string, unknown>
    );

    const merged = Array.from(new Set([...previousEdited, ...newlyChanged]));

    const result = await db
      .update(apartments)
      .set({
        name: body.name,
        address: body.address,
        sizeM2: body.sizeM2,
        numRooms: body.numRooms,
        numBathrooms: body.numBathrooms,
        numBalconies: body.numBalconies,
        hasWashingMachine: body.hasWashingMachine ?? null,
        rentChf: body.rentChf,
        listingUrl: body.listingUrl,
        summary: body.summary ?? null,
        availableFrom,
        userEditedFields: merged.length > 0 ? JSON.stringify(merged) : null,
      })
      .where(scope)
      .returning();

    if (result.length === 0) return notFound();

    let updated = result[0];
    const addressChanged = body.address !== currentRows[0].address;
    if (addressChanged) {
      try {
        const coords = updated.address
          ? await geocodeLatLng(updated.address)
          : null;
        const updatedRows = await db
          .update(apartments)
          .set({
            latitude: coords?.lat ?? null,
            longitude: coords?.lng ?? null,
          })
          .where(scope)
          .returning();
        if (updatedRows[0]) updated = updatedRows[0];
      } catch (err) {
        console.error(
          `[apartments/id:PATCH] geocode failed apt=${apartmentId}:`,
          err
        );
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[apartments/id:PATCH] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update apartment" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let householdId: number;
  let userId: string;
  try {
    ({ householdId, userId } = await requireHousehold());
  } catch (e) {
    if (e instanceof UnauthorizedError) return notAuthenticated();
    throw e;
  }

  try {
    await assertMembership(householdId, userId);
  } catch (e) {
    if (e instanceof ForbiddenError) return notFound();
    throw e;
  }

  try {
    const { id } = await params;
    const apartmentId = parseInt(id);
    if (!Number.isInteger(apartmentId)) return notFound();

    const deleted = await db
      .delete(apartments)
      .where(
        and(
          eq(apartments.id, apartmentId),
          eq(apartments.householdId, householdId)
        )
      )
      .returning({ id: apartments.id });

    if (deleted.length === 0) return notFound();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[apartments/id:DELETE] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete apartment" },
      { status: 500 }
    );
  }
}
