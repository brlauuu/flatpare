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
  // The entry and the path it was read on; an answer for an earlier path is
  // not shown, so the stale entry does not flash while the new read runs.
  const [read, setRead] = useState<{ path: string; item: SharedItem | null } | null>(null);
  const item = read?.path === pathname ? read.item : null;
  const setItem = (next: SharedItem | null) => setRead({ path: pathname, item: next });

  // Read again on every section change: the shared layout stays mounted, and
  // the add page deletes the entry it consumed just before navigating away,
  // so a list read once at load would offer a share that no longer exists.
  useEffect(() => {
    let cancelled = false;
    void listShares().then((all) => {
      if (!cancelled) setRead({ path: pathname, item: all[0] ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

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
