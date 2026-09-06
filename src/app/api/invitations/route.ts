import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { apiErrorResponse, parseBody } from "@/lib/api-route";
import { assertMembership } from "@/lib/household";
import { createInvitation, listInvitations } from "@/lib/invitations";
import { requireHousehold } from "@/lib/session";

const createSchema = z.object({ email: z.string().min(1).max(320) });

async function requireOwner() {
  const { householdId, userId } = await requireHousehold();
  const role = await assertMembership(householdId, userId);
  if (role !== "owner") throw new ApiError("Only the owner can manage invitations", 403);
  return { householdId, userId };
}

const publicShape = (i: { id: number; email: string; expiresAt: Date; createdAt: Date | null }) => ({
  id: i.id,
  email: i.email,
  expiresAt: i.expiresAt,
  createdAt: i.createdAt,
});

export async function GET() {
  try {
    const { householdId } = await requireOwner();
    const rows = await listInvitations(householdId);
    return NextResponse.json({ invitations: rows.map(publicShape) });
  } catch (e) {
    return apiErrorResponse(e, "invitations:GET");
  }
}

export async function POST(req: Request) {
  try {
    const { householdId, userId } = await requireOwner();
    const { email } = await parseBody(req, createSchema);
    const created = await createInvitation(householdId, userId, email);
    return NextResponse.json(publicShape(created), { status: 201 });
  } catch (e) {
    return apiErrorResponse(e, "invitations:POST");
  }
}
