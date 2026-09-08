import { NextResponse } from "next/server";
import { apiErrorResponse, parseBody, requireMember } from "@/lib/api-route";
import { calculateDistance } from "@/lib/distance";
import { distanceRequestSchema } from "@/lib/process-schemas";

// Privacy exception: two plaintext addresses in, two durations out. Not
// logged, nothing written.
export async function POST(req: Request) {
  try {
    await requireMember();
    const { from, to } = await parseBody(req, distanceRequestSchema);
    const result = await calculateDistance(from, to);
    return NextResponse.json({
      bikeMin: result.bikeMinutes,
      transitMin: result.transitMinutes,
    });
  } catch (e) {
    return apiErrorResponse(e, "process:distance");
  }
}
