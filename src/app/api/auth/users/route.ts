import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ratings } from "@/lib/db/schema";

export async function GET() {
  try {
    const rows = await db
      .selectDistinct({ userName: ratings.userName })
      .from(ratings);

    const users = rows.map((r) => r.userName).sort();
    return NextResponse.json(users);
  } catch (error) {
    console.error("[auth/users:GET] Error:", error);
    return NextResponse.json([], { status: 200 });
  }
}
