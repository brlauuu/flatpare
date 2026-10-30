"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiClientError } from "@/components/household-data/api-client";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import { useStoreErrorDetails } from "@/components/household-data/use-store-error-details";
import { cn } from "@/lib/utils";

type Notice = { kind: "noLink" | "full" } | { kind: "error"; text: string } | null;

// Adds an unprocessed apartment for a pasted link (#413), free, and opens it:
// the link is saved, and the address or the PDF can be added there.
// `className` styles the wrapper and `buttonClassName` the button. The list's
// toolbar passes `contents`, so the button sits in its row and the field and
// the notice wrap to a line of their own (#440).
export function PasteLinkButton({ className, buttonClassName }: { className?: string; buttonClassName?: string }) {
  const t = useTranslations("apartments.pasteLink");
  const router = useRouter();
  const errorDetails = useStoreErrorDetails();
  const { createApartmentFromLink } = useHouseholdData();
  const [notice, setNotice] = useState<Notice>(null);
  const [showField, setShowField] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(raw: string) {
    setBusy(true);
    setNotice(null);
    try {
      const created = await createApartmentFromLink(raw, null);
      setShowField(false);
      setText("");
      router.push(`/apartments/${created.id}`);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409 && err.message === "Apartment limit reached") {
        setNotice({ kind: "full" });
      } else {
        // createApartmentFromLink refuses text without a web link before any request.
        setNotice(
          err instanceof Error && err.message !== "Not a web link"
            ? { kind: "error", text: errorDetails(err).message ?? "" }
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
        className={cn("h-11 w-full sm:h-9 sm:w-auto", buttonClassName)}
      >
        <ClipboardPaste className="h-4 w-4" />
        {t("paste")}
      </Button>
      {showField && (
        <form
          className="flex basis-full items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save(text);
          }}
        >
          <Input
            type="text"
            inputMode="url"
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
        <p role="status" className="basis-full text-sm text-destructive">
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
