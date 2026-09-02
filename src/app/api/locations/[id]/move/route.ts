import { NextResponse } from "next/server";
import { moveLocation } from "@/lib/locations";
import {
  assertMembership,
  ForbiddenError,
  UnauthorizedError,
} from "@/lib/household";
import { requireHousehold } from "@/lib/session";

const notFound = () =>
  NextResponse.json({ error: "Not found" }, { status: 404 });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let householdId: number;
  let userId: string;
  try {
    ({ householdId, userId } = await requireHousehold());
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
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
    const body = (await request.json()) as { direction?: unknown };
    if (body.direction !== "up" && body.direction !== "down") {
      return NextResponse.json(
        { error: "direction must be 'up' or 'down'" },
        { status: 400 }
      );
    }
    await moveLocation(householdId, parseInt(id), body.direction);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const isValidation = /not found/i.test(message);
    console.error("[locations/id/move:POST] Error:", error);
    return NextResponse.json(
      { error: message },
      { status: isValidation ? 404 : 500 }
    );
  }
}
