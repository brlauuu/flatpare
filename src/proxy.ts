import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const authCookie = request.cookies.get("flatpare-auth");
  const nameCookie = request.cookies.get("flatpare-name");
  const isAuthed = authCookie?.value === "true";
  const hasName = !!nameCookie?.value;
  const path = request.nextUrl.pathname;

  // Allow access to login page and auth API
  if (path === "/" || path.startsWith("/api/auth")) {
    // If already fully authed, redirect away from login
    if (path === "/" && isAuthed && hasName) {
      return NextResponse.redirect(new URL("/apartments", request.url));
    }
    return NextResponse.next();
  }

  // Protect all other routes
  if (!isAuthed || !hasName) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const proxyConfig = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/(?!auth)).*)",
  ],
};
