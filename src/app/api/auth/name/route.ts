import { NextResponse } from "next/server";
import { isAuthenticated, setDisplayName, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return unauthorized();

  const { displayName } = await request.json();

  if (!displayName || typeof displayName !== "string" || !displayName.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const name = displayName.trim();

  await db.insert(users).values({ name }).onConflictDoNothing();
  await setDisplayName(name);

  return NextResponse.json({ success: true });
}
