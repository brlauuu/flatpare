import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { requireHousehold } from "@/lib/session";
import {
  householdIdFromStoredPath,
  hasResidualPercentEncoding,
} from "@/lib/storage";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

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

  // Defense in depth, not a live vector here: this route resolves the
  // stored path with path.resolve, which performs no second decode, so a
  // double-encoded traversal segment ("%252e%252e") becomes a literal
  // directory name and 404s rather than escaping UPLOADS_DIR — verified
  // below by the belt-and-braces prefix check too. /api/pdf/[...path] needs
  // this guard for real (see hasResidualPercentEncoding in pathname.ts:
  // @vercel/blob's get() performs exactly the second decode that would make
  // residual encoding dangerous there); mirrored here so the two sibling
  // routes stay symmetric instead of the asymmetry reading as an oversight.
  if (hasResidualPercentEncoding(segments)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filename = segments.join("/");

  const owner = householdIdFromStoredPath(filename);
  if (owner === null || owner !== householdId) {
    // 404, not 403: a 403 confirms the file exists in someone else's household.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Belt-and-braces: confirm the resolved path still lands inside UPLOADS_DIR.
  const filePath = path.resolve(UPLOADS_DIR, filename);
  if (!filePath.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${path.basename(filePath)}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
