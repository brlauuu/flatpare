import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const authCookie = request.cookies.get("flatpare-auth");
  const nameCookie = request.cookies.get("flatpare-name");
  const isAuthed = authCookie?.value === "true";
  const hasName = !!nameCookie?.value;
  const path = request.nextUrl.pathname;

  // Login page and the main auth endpoint are always reachable.
  if (path === "/" || path === "/api/auth") {
    // Bounce a fully-authed user away from the login page.
    if (path === "/" && isAuthed && hasName) {
      return NextResponse.redirect(new URL("/apartments", request.url));
    }
    return NextResponse.next();
  }

  // Other auth API routes and the onboarding page require the app password (isAuthed).
  if (path.startsWith("/api/auth/") || path === "/add-user") {
    if (!isAuthed) {
      if (path.startsWith("/api/")) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // All other routes require full authentication (password + display name).
  if (!isAuthed || !hasName) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
