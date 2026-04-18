import { NextResponse } from "next/server";
import { setAuthenticated, verifyPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const { password } = await request.json();

  if (!verifyPassword(password)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  await setAuthenticated();
  return NextResponse.json({ success: true });
}
