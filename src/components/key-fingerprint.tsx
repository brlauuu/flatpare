"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fingerprint } from "@/lib/crypto";

// A member's public-key fingerprint as 8 emoji (#218). The caller decides
// which key to pass: the device's own for the signed-in member, the server's
// copy for everyone else — that asymmetry is the whole point.
export function KeyFingerprint({ spki }: { spki: string }) {
  const t = useTranslations("household.fingerprint");
  const [code, setCode] = useState<{ spki: string; emoji: string[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fingerprint(spki).then((emoji) => {
      if (!cancelled) setCode({ spki, emoji });
    });
    return () => {
      cancelled = true;
    };
  }, [spki]);

  // Never show the previous key's code while the next one is computing.
  const emoji = code?.spki === spki ? code.emoji : null;
  return (
    <p className="text-base tracking-[0.2em]" data-testid="key-fingerprint">
      <span className="sr-only">{t("label")} </span>
      {emoji ? emoji.join(" ") : <span className="text-xs tracking-normal text-muted-foreground">{t("computing")}</span>}
    </p>
  );
}
