"use client";

import { HouseholdSettings } from "@/components/household-settings";
import { LocationsSettings } from "@/components/locations-settings";
import { useHouseholdData } from "@/components/household-data/use-household-data";

// Everything about the group, for every member (#298): who is in, who is
// invited, the shared locations. What only the owner may do — invite,
// remove, rotate, recompute — is decided inside each section.
export default function HouseholdPage() {
  const { identity } = useHouseholdData();
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Household</h1>
      <HouseholdSettings />
      <LocationsSettings canRecompute={identity.role === "owner"} />
    </div>
  );
}
