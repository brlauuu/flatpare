import { NextResponse } from "next/server";
import { setDisplayName } from "@/lib/auth";

export async function POST(request: Request) {
  const { displayName } = await request.json();

  if (!displayName || typeof displayName !== "string" || !displayName.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  await setDisplayName(displayName.trim());
  return NextResponse.json({ success: true });
}
