import { NextResponse } from "next/server";
import { calculateDistance } from "@/lib/distance";

export async function POST(request: Request) {
  try {
    const { address } = await request.json();

    if (!address || typeof address !== "string") {
      return NextResponse.json(
        { error: "Address is required" },
        { status: 400 }
      );
    }

    const result = await calculateDistance(address);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[distance:POST] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to calculate distance" },
      { status: 500 }
    );
  }
}
