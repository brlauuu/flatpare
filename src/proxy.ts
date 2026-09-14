import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

// Reachable by a signed-in user who has no household yet. Everything else
// needs both a user and a household.
const NO_HOUSEHOLD_ALLOWED = [
  /^\/invitations$/,
  /^\/api\/invitations\/mine$/,
  /^\/api\/invitations\/decline$/,
  /^\/api\/invitations\/\d+\/accept$/,
];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Auth.js owns its own endpoints; gating them breaks the sign-in flow.
  if (path.startsWith("/api/auth/")) return NextResponse.next();

  // Stripe posts here with no session and no cookie, so a session gate would
  // reject every real event. The route authenticates the request itself, by
  // verifying Stripe's signature over the raw body — it is the only endpoint
  // in the app whose authentication is not the session, and the only one
  // allowed past this gate for that reason.
  if (path === "/api/billing/webhook") return NextResponse.next();

  const session = await auth();
  const userId = session?.user?.id;
  const hasHousehold = !!userId && !!session?.householdId;
  const isApi = path.startsWith("/api/");

  if (path === "/") {
    if (hasHousehold) return NextResponse.redirect(new URL("/apartments", request.url));
    if (userId) return NextResponse.redirect(new URL("/invitations", request.url));
    return NextResponse.next();
  }

  if (!userId) {
    return isApi
      ? NextResponse.json({ error: "Not authenticated" }, { status: 401 })
      : NextResponse.redirect(new URL("/", request.url));
  }

  if (!hasHousehold) {
    if (NO_HOUSEHOLD_ALLOWED.some((re) => re.test(path))) return NextResponse.next();
    return isApi
      ? NextResponse.json({ error: "No household" }, { status: 403 })
      : NextResponse.redirect(new URL("/invitations", request.url));
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
