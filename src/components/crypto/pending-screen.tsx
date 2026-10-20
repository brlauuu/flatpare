"use client";

import { useTranslations } from "next-intl";

export function PendingScreen({
  pollMs,
  problem,
  extra,
}: {
  pollMs: number;
  problem?: string | null;
  extra?: React.ReactNode;
}) {
  const t = useTranslations("crypto");
  return (
    <div className="space-y-4">
      <h1 className="title-page">{t("pending.title")}</h1>
      {problem ? (
        <p className="text-sm text-destructive">{problem}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{t("pending.waiting")}</p>
      )}
      <p className="text-sm text-muted-foreground">
        {t("pending.polling", { seconds: Math.round(pollMs / 1000) })}
      </p>
      {extra}
    </div>
  );
}
