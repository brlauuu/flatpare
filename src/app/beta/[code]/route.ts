import { NextResponse, type NextRequest } from "next/server";
import {
  BETA_PASS_COOKIE,
  BETA_PASS_COOKIE_MAX_AGE_SECONDS,
  findUsableBetaPass,
} from "@/lib/beta-pass";

// The beta-pass link (#239, #240): `/beta/<code>`.
//
// Does not consume a use — the pass is spent when it actually admits a new
// account (src/lib/sign-up-gate.ts), so a tester who opens the link twice, or
// opens it and never signs up, does not burn it. Here we only check that the
// pass is currently usable, hand the browser the cookie the signIn callback
// looks for, and send them to the landing page to sign in. An unusable code
// goes to the same page with a different notice; the code itself is never
// echoed back.
//
// The proxy passes /beta/* through unconditionally: the person opening this
// has no session to check.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const pass = await findUsableBetaPass(code);

  if (!pass) {
    return NextResponse.redirect(new URL("/?beta=invalid", req.url));
  }

  const res = NextResponse.redirect(new URL("/?beta=ready", req.url));
  res.cookies.set(BETA_PASS_COOKIE, pass.code, {
    httpOnly: true,
    sameSite: "lax",
    // Like Auth.js's own session cookie: Secure exactly when the request is
    // https, so a plain-http self-host still works.
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: BETA_PASS_COOKIE_MAX_AGE_SECONDS,
  });
  return res;
}
