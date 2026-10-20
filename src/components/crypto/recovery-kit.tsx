"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function RecoveryKit({
  code,
  onContinue,
  title,
}: {
  code: string;
  onContinue: () => void;
  title?: string;
}) {
  const t = useTranslations("crypto");
  const [acked, setAcked] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
  }

  return (
    <div className="space-y-4 print:max-w-none">
      <h1 className="title-page">{title ?? t("recoveryKit.title")}</h1>
      <p className="text-sm text-muted-foreground print:hidden">{t("recoveryKit.intro")}</p>
      <p className="rounded-md border bg-muted p-4 text-center font-mono text-lg tracking-wider">
        {code}
      </p>
      <div className="flex gap-2 print:hidden">
        <Button type="button" variant="outline" onClick={copy}>
          {t("recoveryKit.copy")}
        </Button>
        <Button type="button" variant="outline" onClick={() => window.print()}>
          {t("recoveryKit.print")}
        </Button>
        {copied && <span className="self-center text-sm text-muted-foreground">{t("recoveryKit.copied")}</span>}
      </div>
      <label className="flex items-start gap-2 text-sm print:hidden">
        <input
          type="checkbox"
          className="mt-1"
          checked={acked}
          onChange={(e) => setAcked(e.target.checked)}
        />
        <span>{t("recoveryKit.acknowledge")}</span>
      </label>
      <Button type="button" className="print:hidden" disabled={!acked} onClick={onContinue}>
        {t("recoveryKit.continue")}
      </Button>
    </div>
  );
}
