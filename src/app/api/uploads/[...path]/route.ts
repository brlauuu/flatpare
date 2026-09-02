import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { requireHousehold } from "@/lib/session";
import { householdIdFromStoredPath } from "@/lib/storage";

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
