"use client";

import Link from "next/link";
import { EncryptionSettings } from "@/components/crypto/encryption-settings";

// Settings is about the signed-in person (#298): their keys, their recovery
// kit. Everything about the group — members, invitations, locations — is the
// Household page. The pointer stays because members had learned to look here.
export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <h1 className="title-page">Settings</h1>
      <EncryptionSettings />
      <p className="text-sm text-muted-foreground">
        Members, invitations and locations of interest have moved to the{" "}
        <Link href="/household" className="underline underline-offset-2">
          Household
        </Link>{" "}
        page.
      </p>
    </div>
  );
}
