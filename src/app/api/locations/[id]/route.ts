import { NextResponse } from "next/server";
import {
  deleteLocation,
  getLocation,
  updateLocation,
} from "@/lib/locations";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const loc = await getLocation(parseInt(id));
    if (!loc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
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

    const updated = await updateLocation(parseInt(id), patch);
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const isValidation = /empty|icon|not found/i.test(message);
    console.error("[locations/id:PUT] Error:", error);
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
  try {
    const { id } = await params;
    await deleteLocation(parseInt(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[locations/id:DELETE] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
