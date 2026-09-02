import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, NAME_COOKIE, authCookieMatches } from "@/lib/auth-cookie";

export function proxy(request: NextRequest) {
  const isAuthed = authCookieMatches(request.cookies.get(AUTH_COOKIE)?.value);
  const hasName = !!request.cookies.get(NAME_COOKIE)?.value;
  const path = request.nextUrl.pathname;

  // API routes return JSON 401 on failure — the UI handles that better than a
  // 302 to an HTML login page, and external clients can detect it cleanly.
  const deny = () =>
    path.startsWith("/api/")
      ? NextResponse.json({ error: "Not authenticated" }, { status: 401 })
      : NextResponse.redirect(new URL("/", request.url));

  // Login page and the password endpoint are the only public paths. Note the
  // exact match: `startsWith("/api/auth")` used to expose every sub-route,
  // including user listing and deletion.
  if (path === "/" || path === "/api/auth") {
    // Bounce a fully-authed user away from the login page.
    if (path === "/" && isAuthed && hasName) {
      return NextResponse.redirect(new URL("/apartments", request.url));
    }
    return NextResponse.next();
  }

  // Picking or creating a display name needs the password but not a name —
  // that's the step where the name cookie gets set.
  if (path.startsWith("/api/auth/") || path === "/add-user") {
    if (!isAuthed) return deny();
    return NextResponse.next();
  }

  // Everything else requires password + display name.
  if (!isAuthed || !hasName) return deny();

  return NextResponse.next();
}

export const config = {
  matcher: [
    // The PWA manifest and its icons must stay public: a browser fetches the
    // manifest WITHOUT credentials, so gating it behind auth makes the app
    // silently uninstallable (the fetch gets a 307 to the login page and the
    // manifest never parses). None of these files contain user data.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-192.png|icon-512.png|icon-maskable-512.png|apple-touch-icon.png).*)",
  ],
};
