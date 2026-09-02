import { NextResponse } from "next/server";
import { createLocation, listLocations } from "@/lib/locations";
import { UnauthorizedError } from "@/lib/household";
import { requireHousehold } from "@/lib/session";

export async function GET() {
  let householdId: number;
  try {
    ({ householdId } = await requireHousehold());
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    throw e;
  }

  try {
    const locations = await listLocations(householdId);
    return NextResponse.json(locations);
  } catch (error) {
    console.error("[locations:GET] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let householdId: number;
  try {
    ({ householdId } = await requireHousehold());
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    throw e;
  }

  try {
    const body = (await request.json()) as {
      label?: unknown;
      icon?: unknown;
      address?: unknown;
    };
    if (
      typeof body.label !== "string" ||
      typeof body.icon !== "string" ||
      typeof body.address !== "string"
    ) {
      return NextResponse.json(
        { error: "label, icon, and address are required strings" },
        { status: 400 }
      );
    }
    const created = await createLocation(householdId, {
      label: body.label,
      icon: body.icon,
      address: body.address,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const isValidation =
      /more than|empty|icon/i.test(message);
    console.error("[locations:POST] Error:", error);
    return NextResponse.json(
      { error: message },
      { status: isValidation ? 400 : 500 }
    );
  }
}
