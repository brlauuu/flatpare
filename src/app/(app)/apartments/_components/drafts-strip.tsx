"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import { hostOf } from "@/lib/household-data/links";
import { cn } from "@/lib/utils";

export function DraftsStrip() {
  const t = useTranslations("apartments.drafts");
  const format = useFormatter();
  const { drafts, deleteDraft } = useHouseholdData();
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());

  async function remove(id: string) {
    setDeleting((s) => new Set(s).add(id));
    setFailed((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    try {
      await deleteDraft(id);
    } catch {
      setFailed((s) => new Set(s).add(id));
    } finally {
      setDeleting((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }
  if (drafts.length === 0) return null;

  return (
    <section
      aria-label={t("title")}
      className="overflow-hidden rounded-lg border-3 border-frame bg-card shadow-frame"
    >
      <h2 className="title-section border-b px-3 py-2">{t("title")}</h2>
      <ul className="divide-y">
        {drafts.map((d) => (
          <li key={d.id} className="flex flex-col gap-2 px-3 py-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {d.corrupt || d.url === null ? (
                <span className="text-sm text-muted-foreground">
                  {t("corrupt")}
                </span>
              ) : (
                <div className="min-w-0">
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm font-medium underline"
                  >
                    {d.title ?? hostOf(d.url)}
                  </a>
                  <span className="text-xs text-muted-foreground">
                    {t("sharedBy", {
                      name: d.createdByName ?? t("formerMember"),
                      date: format.dateTime(new Date(d.createdAt), {
                        dateStyle: "medium",
                      }),
                    })}
                  </span>
                </div>
              )}
              <div className="flex shrink-0 items-center gap-2">
                {!d.corrupt && d.url !== null && (
                  <Link
                    href={`/apartments/new?draft=${d.id}`}
                    className={cn(
                      buttonVariants({ size: "sm" }),
                      "h-11 sm:h-8",
                    )}
                  >
                    {t("add")}
                  </Link>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-11 sm:h-8"
                  disabled={deleting.has(d.id)}
                  onClick={() => void remove(d.id)}
                >
                  {t("delete")}
                </Button>
              </div>
            </div>
            {failed.has(d.id) && (
              <p role="status" className="text-sm text-destructive">
                {t("deleteFailed")}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
