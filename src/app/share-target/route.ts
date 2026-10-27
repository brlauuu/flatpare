import { NextResponse, type NextRequest } from "next/server";

// The share sheet's target when no service worker took the share (#190):
// the first visit before the worker is active, or a worker that failed.
// public/sw.js normally answers this POST in the browser and the request
// never arrives here. Without the worker there is nowhere safe to keep a
// shared PDF (it must not be stored on the server unencrypted), so the body
// is never read and nothing about the request is logged. The add page asks
// the person to share again or use the upload button.
//
// Excluded from the proxy matcher: signed out, the proxy would answer the
// POST with a 307 to `/`, which the browser replays as a POST to the
// landing page.
export function POST(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL("/apartments/new?share=unavailable", request.url), 303);
}
