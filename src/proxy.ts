import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Auth.js owns its own endpoints; gating them breaks the sign-in flow.
  if (path.startsWith("/api/auth/")) return NextResponse.next();

  const session = await auth();
  const isAuthed = !!session?.user?.id && !!session.householdId;

  if (path === "/") {
    if (isAuthed) return NextResponse.redirect(new URL("/apartments", request.url));
    return NextResponse.next();
  }

  if (!isAuthed) {
    return path.startsWith("/api/")
      ? NextResponse.json({ error: "Not authenticated" }, { status: 401 })
      : NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // The PWA manifest and its icons must stay public: a browser fetches the
    // manifest WITHOUT credentials, so gating it makes the app silently
    // uninstallable. None of these files contain user data.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-192.png|icon-512.png|icon-maskable-512.png|apple-touch-icon.png).*)",
  ],
};
