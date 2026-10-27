"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiClientError } from "@/components/household-data/api-client";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import { cn } from "@/lib/utils";

type Notice = { kind: "noLink" | "full" } | { kind: "error"; text: string } | null;

export function PasteLinkButton({ className }: { className?: string }) {
  const t = useTranslations("apartments.drafts");
  const { createDraft } = useHouseholdData();
  const [notice, setNotice] = useState<Notice>(null);
  const [showField, setShowField] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(raw: string) {
    setBusy(true);
    setNotice(null);
    try {
      await createDraft(raw, null);
      setShowField(false);
      setText("");
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409 && err.message === "Too many drafts") {
        setNotice({ kind: "full" });
      } else {
        // createDraft refuses text without a web link before any request.
        setNotice(
          err instanceof Error && err.message !== "Not a web link"
            ? { kind: "error", text: err.message }
            : { kind: "noLink" }
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function paste() {
    setNotice(null);
    let clip: string;
    try {
      clip = await navigator.clipboard.readText();
    } catch {
      setShowField(true);
      return;
    }
    await save(clip);
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => void paste()}
        className="h-11 w-full sm:h-9 sm:w-auto"
      >
        <ClipboardPaste className="h-4 w-4" />
        {t("paste")}
      </Button>
      {showField && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save(text);
          }}
        >
          <Input
            type="url"
            aria-label={t("pasteField")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="h-11 sm:h-9"
          />
          <Button type="submit" disabled={busy} className="h-11 sm:h-9">
            {t("save")}
          </Button>
        </form>
      )}
      {notice !== null && (
        <p role="status" className="text-sm text-destructive">
          {notice.kind === "full"
            ? t("full")
            : notice.kind === "error"
              ? notice.text
              : t("pasteNoLink")}
        </p>
      )}
    </div>
  );
}
