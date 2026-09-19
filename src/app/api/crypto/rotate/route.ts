import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api-error";
import { apiErrorResponse, parseBody, requireEncryptionOn } from "@/lib/api-route";
import { rotateSchema } from "@/lib/crypto-schemas";
import { assertMembership } from "@/lib/household";
import { listRotationTargets, rotateHouseholdKey } from "@/lib/member-keys";
import { requireHousehold } from "@/lib/session";
import { deleteStoredFile, storedPathHousehold } from "@/lib/storage";

// Data-key rotation (#219). GET tells the owner's browser what to rotate
// from and whom to wrap for; POST commits what it prepared, all or nothing
// (see rotateHouseholdKey). Owner only: rotation follows a removal, and only
// the owner can remove.

async function requireOwner(): Promise<{ householdId: number; userId: string }> {
  const { householdId, userId } = await requireHousehold();
  requireEncryptionOn();
  const role = await assertMembership(householdId, userId);
  if (role !== "owner") throw new ApiError("Only the owner can rotate the household key", 403);
  return { householdId, userId };
}

export async function GET() {
  try {
    const { householdId } = await requireOwner();
    return NextResponse.json(await listRotationTargets(householdId));
  } catch (e) {
    return apiErrorResponse(e, "crypto:rotate:GET");
  }
}

export async function POST(req: Request) {
  try {
    const { householdId, userId } = await requireOwner();
    const body = await parseBody(req, rotateSchema);
    // Every retired path must be this household's BEFORE anything commits:
    // a rotation that succeeds and then refuses to clean up would leave the
    // old ciphertext files behind with no second chance to name them.
    const retired: string[] = [];
    for (const p of body.retiredPdfPaths) {
      const resolved = storedPathHousehold(p);
      if (!resolved || resolved.householdId !== householdId) {
        throw new ApiError("retiredPdfPaths must belong to this household", 400);
      }
      retired.push(resolved.canonicalUrl);
    }
    const result = await rotateHouseholdKey(householdId, userId, body);
    // After the commit, and best-effort: the new rows already point at the
    // re-encrypted files, so a leftover old file is waste, not a hole.
    for (const p of retired) await deleteStoredFile(p, householdId);
    return NextResponse.json(result);
  } catch (e) {
    return apiErrorResponse(e, "crypto:rotate:POST");
  }
}
