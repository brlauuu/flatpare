"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { deleteShare, listShares, type SharedItem } from "@/lib/share-stash";

// Offers a share that was interrupted (#190): the phone's share sheet stashed
// it, but the sign-in redirect or the unlock screen got in the way. Mounted
// inside the household provider, so it only exists once the app is unlocked.
// Only the newest entry is offered; older ones come on later loads.
export function PendingSharePrompt() {
  const t = useTranslations("apartments.sharePrompt");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [item, setItem] = useState<SharedItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listShares().then((all) => {
      if (!cancelled) setItem(all[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!item) return null;
  if (pathname === "/apartments/new" && params.get("share") === item.id) {
    return null;
  }

  return (
    <div
      role="status"
      className="mx-auto mb-4 flex max-w-[62rem] flex-wrap items-center justify-between gap-3 border-3 border-frame bg-card p-3 shadow-frame"
    >
      <p className="text-sm font-medium">
        {item.files.length > 0 ? t("pdf") : t("link")}
      </p>
      <div className="flex gap-2">
        <Button
          className="min-h-11"
          onClick={() => {
            const id = item.id;
            setItem(null);
            router.push(`/apartments/new?share=${encodeURIComponent(id)}`);
          }}
        >
          {t("add")}
        </Button>
        <Button
          variant="outline"
          className="min-h-11"
          onClick={() => {
            const id = item.id;
            setItem(null);
            void deleteShare(id);
          }}
        >
          {t("discard")}
        </Button>
      </div>
    </div>
  );
}
