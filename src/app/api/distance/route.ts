import { NextResponse } from "next/server";
import { calculateDistance } from "@/lib/distance";

export async function POST(request: Request) {
  const { address } = await request.json();

  if (!address || typeof address !== "string") {
    return NextResponse.json(
      { error: "Address is required" },
      { status: 400 }
    );
  }

  const result = await calculateDistance(address);
  return NextResponse.json(result);
}
