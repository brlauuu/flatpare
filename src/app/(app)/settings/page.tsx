"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { AccountNameSettings } from "@/components/account-name-settings";
import { EncryptionSettings } from "@/components/crypto/encryption-settings";

// Settings is about the signed-in person (#298): their name (#327), their
// keys, their recovery kit. Everything about the group — members,
// invitations, locations — is the Household page. The pointer stays because members had learned to look here.
export default function SettingsPage() {
  const t = useTranslations("settings.page");
  return (
    <div className="space-y-8">
      <h1 className="title-page">{t("title")}</h1>
      <AccountNameSettings />
      <EncryptionSettings />
      <p className="text-sm text-muted-foreground">
        {t.rich("moved", {
          household: (chunks) => (
            <Link href="/household" className="underline underline-offset-2">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </div>
  );
}
