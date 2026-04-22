import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { ratings, users } from "@/lib/db/schema";
import { eq, ne, asc } from "drizzle-orm";
import { setDisplayName } from "@/lib/auth";

const NAME_COOKIE = "flatpare-name";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name: raw } = await params;
    const name = decodeURIComponent(raw);

    await db.delete(ratings).where(eq(ratings.userName, name));
    await db.delete(users).where(eq(users.name, name));

    const cookieStore = await cookies();
    const currentName = cookieStore.get(NAME_COOKIE)?.value;
    const isSelf = currentName === name;

    if (!isSelf) {
      return NextResponse.json({ switchedTo: undefined });
    }

    const [next] = await db
      .select({ name: users.name })
      .from(users)
      .where(ne(users.name, name))
      .orderBy(asc(users.createdAt))
      .limit(1);

    if (next) {
      await setDisplayName(next.name);
      return NextResponse.json({ switchedTo: next.name });
    }

    cookieStore.delete(NAME_COOKIE);
    return NextResponse.json({ switchedTo: null });
  } catch (error) {
    console.error("[auth/users/[name]:DELETE] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete user" },
      { status: 500 }
    );
  }
}
