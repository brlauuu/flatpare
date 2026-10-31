"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export const USAGE_NOTICE_KEY = "flatpare_usage_notice_seen";

// Where storage is refused (a private window), dismissal lasts this visit.
let dismissedThisVisit = false;
const listeners = new Set<() => void>();

function readDismissed(): boolean {
  if (dismissedThisVisit) return true;
  try {
    return window.localStorage.getItem(USAGE_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

function dismiss() {
  dismissedThisVisit = true;
  try {
    window.localStorage.setItem(USAGE_NOTICE_KEY, "1");
  } catch {
    // Kept in memory above.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Says once, to every member, that the server counts processing per household
// and the host reviews the counts (#468). Members who signed up before the
// landing page said so see it too. Dismissed per browser.
export function UsageNotice() {
  const t = useTranslations("nav.usageNotice");
  // The server renders it dismissed, so it never flashes in and out.
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);
  if (dismissed) return null;

  return (
    <section
      aria-labelledby="usage-notice-title"
      data-usage-notice
      className="mx-auto mb-4 flex max-w-[62rem] flex-col gap-2 border-2 border-frame bg-card p-3 text-sm sm:flex-row sm:items-start sm:gap-4"
    >
      <div className="flex-1 space-y-1">
        <h2 id="usage-notice-title" className="font-semibold">
          {t("title")}
        </h2>
        <p>{t("body")}</p>
        <Link href="/guide" className="inline-block text-primary underline underline-offset-2">
          {t("more")}
        </Link>
      </div>
      <Button type="button" size="sm" className="h-11 shrink-0 self-start sm:h-8" onClick={dismiss}>
        {t("dismiss")}
      </Button>
    </section>
  );
}
