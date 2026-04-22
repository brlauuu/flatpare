import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { isAuthenticated } from "@/lib/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path: segments } = await params;
  const pathname = segments.join("/");

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
