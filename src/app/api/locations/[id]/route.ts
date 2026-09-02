import { NextResponse } from "next/server";
import {
  deleteLocation,
  getLocation,
  updateLocation,
} from "@/lib/locations";
import {
  assertMembership,
  ForbiddenError,
  UnauthorizedError,
} from "@/lib/household";
import { requireHousehold } from "@/lib/session";

const notFound = () =>
  NextResponse.json({ error: "Not found" }, { status: 404 });
const notAuthenticated = () =>
  NextResponse.json({ error: "Not authenticated" }, { status: 401 });

export async function GET(
  _req: Request,
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
    const loc = await getLocation(householdId, parseInt(id));
    if (!loc) return notFound();
    return NextResponse.json(loc);
  } catch (error) {
    console.error("[locations/id:GET] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PUT(
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

  try {
    await assertMembership(householdId, userId);
  } catch (e) {
    if (e instanceof ForbiddenError) return notFound();
    throw e;
  }

  try {
    const { id } = await params;
    const body = (await request.json()) as Partial<{
      label: unknown;
      icon: unknown;
      address: unknown;
    }>;
    const patch: Partial<{ label: string; icon: string; address: string }> = {};
    if (typeof body.label === "string") patch.label = body.label;
    if (typeof body.icon === "string") patch.icon = body.icon;
    if (typeof body.address === "string") patch.address = body.address;

    const updated = await updateLocation(householdId, parseInt(id), patch);
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    console.error("[locations/id:PUT] Error:", error);
    // "not found" now means "not found IN THIS HOUSEHOLD", so it must be a
    // 404. It used to be folded into the 400 validation bucket, which would
    // have made a cross-household id distinguishable from a bad payload.
    if (/not found/i.test(message)) return notFound();
    const isValidation = /empty|icon/i.test(message);
    return NextResponse.json(
      { error: message },
      { status: isValidation ? 400 : 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
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
    const deleted = await deleteLocation(householdId, parseInt(id));
    if (!deleted) return notFound();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[locations/id:DELETE] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
