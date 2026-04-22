import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { asc } from "drizzle-orm";

export async function GET() {
  try {
    const rows = await db
      .select({ name: users.name })
      .from(users)
      .orderBy(asc(users.name));
    return NextResponse.json(rows.map((r) => r.name));
  } catch (error) {
    console.error("[auth/users:GET] Error:", error);
    return NextResponse.json([], { status: 200 });
  }
}
