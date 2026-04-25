import { NextResponse } from "next/server";
import { getStationAddress, setStationAddress } from "@/lib/app-settings";

export async function GET() {
  try {
    const stationAddress = await getStationAddress();
    return NextResponse.json({ stationAddress });
  } catch (error) {
    console.error("[settings:GET] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load settings",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { stationAddress?: unknown };
    const { stationAddress } = body;

    if (typeof stationAddress !== "string" || stationAddress.trim() === "") {
      return NextResponse.json(
        { error: "stationAddress must be a non-empty string" },
        { status: 400 }
      );
    }

    await setStationAddress(stationAddress);
    return NextResponse.json({ stationAddress: stationAddress.trim() });
  } catch (error) {
    console.error("[settings:PUT] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to save settings",
      },
      { status: 500 }
    );
  }
}
