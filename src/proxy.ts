import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const authCookie = request.cookies.get("flatpare-auth");
  const nameCookie = request.cookies.get("flatpare-name");
  const isAuthed = authCookie?.value === "true";
  const hasName = !!nameCookie?.value;
  const path = request.nextUrl.pathname;

  // Login page + auth API are always reachable.
  if (path === "/" || path.startsWith("/api/auth")) {
    // Bounce a fully-authed user away from the login page.
    if (path === "/" && isAuthed && hasName) {
      return NextResponse.redirect(new URL("/apartments", request.url));
    }
    return NextResponse.next();
  }

  // API routes return JSON 401 on failure — the UI handles that better than a
  // 302 to an HTML login page, and external clients can detect it cleanly.
  if (path.startsWith("/api/")) {
    if (!isAuthed || !hasName) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // Page routes redirect to the login screen.
  if (!isAuthed || !hasName) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
