import { NextResponse } from "next/server";
import { moveLocation } from "@/lib/locations";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { direction?: unknown };
    if (body.direction !== "up" && body.direction !== "down") {
      return NextResponse.json(
        { error: "direction must be 'up' or 'down'" },
        { status: 400 }
      );
    }
    await moveLocation(parseInt(id), body.direction);
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
