"use client";

import { useTranslations } from "next-intl";
import { HouseholdSettings } from "@/components/household-settings";
import { LocationsSettings } from "@/components/locations-settings";
import { DataTransferSettings } from "@/components/data-transfer-settings";
import { useHouseholdData } from "@/components/household-data/use-household-data";

// Everything about the group, for every member (#298): who is in, who is
// invited, the shared locations, and the household's export (#191). What only the owner may do — invite,
// remove, rotate, recompute — is decided inside each section.
export default function HouseholdPage() {
  const { identity } = useHouseholdData();
  const t = useTranslations("household.page");
  return (
    <div className="space-y-8">
      <h1 className="title-page">{t("title")}</h1>
      <HouseholdSettings />
      <LocationsSettings canRecompute={identity.role === "owner"} />
      <DataTransferSettings />
    </div>
  );
}
