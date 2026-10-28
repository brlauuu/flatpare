import { NextResponse } from "next/server";
import { apiErrorResponse, requireMember } from "@/lib/api-route";
import { draftRow } from "@/lib/data-rows";
import { listDrafts } from "@/lib/drafts";

// Drafts left from before #413, which the store turns into apartments. There
// is no create route any more: a link becomes an unprocessed apartment.

export async function GET() {
  try {
    const { householdId } = await requireMember();
    return NextResponse.json((await listDrafts(householdId)).map(draftRow));
  } catch (e) {
    return apiErrorResponse(e, "drafts:list");
  }
}
