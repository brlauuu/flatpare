"use client";

import { useHouseholdData } from "@/components/household-data/use-household-data";

// Who added an apartment (#430), resolved against the current members: you,
// a member by their name now, or someone who has left. Null when nobody
// knows (added before #430, or imported), and until the members list has
// arrived, so nobody is shown as a former member by mistake.
export type AddedBy = { kind: "you" } | { kind: "member"; name: string } | { kind: "former" };

export function useAddedBy(addedBy: string | null): AddedBy | null {
  const { identity, memberNames } = useHouseholdData();
  if (addedBy === null) return null;
  if (addedBy === identity.userId) return { kind: "you" };
  if (memberNames === null) return null;
  const name = memberNames[addedBy];
  return name === undefined ? { kind: "former" } : { kind: "member", name };
}
