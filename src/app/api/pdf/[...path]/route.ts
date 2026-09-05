import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { requireHousehold } from "@/lib/session";
import {
  householdIdFromStoredPath,
  hasResidualPercentEncoding,
} from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  let householdId: number;
  try {
    ({ householdId } = await requireHousehold());
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { path: segments } = await params;

  // See hasResidualPercentEncoding in storage.ts: Next has already decoded
  // each segment once here, so anything still carrying a "%" is either a
  // double-encoded traversal payload or a filename @vercel/blob's get()
  // would resolve differently than what we checked. Refuse before either
  // string is built.
  if (hasResidualPercentEncoding(segments)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pathname = segments.join("/");

  const owner = householdIdFromStoredPath(pathname);
  if (owner === null || owner !== householdId) {
    // 404, not 403: a 403 confirms the file exists in someone else's household.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const result = await get(pathname, { access: "private" });
    if (!result || result.statusCode !== 200) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const headers = new Headers();
    headers.set(
      "Content-Type",
      result.headers.get("content-type") ?? "application/pdf"
    );
    headers.set(
      "Content-Disposition",
      result.blob.contentDisposition ?? "inline"
    );

    return new Response(result.stream, { headers });
  } catch (error) {
    console.error("[pdf:GET] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch PDF" },
      { status: 500 }
    );
  }
}
