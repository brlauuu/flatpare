import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ShareConfirmation } from "./use-share-intake";

interface ShareConfirmProps {
  confirmation: ShareConfirmation | null;
  onConfirm(): void;
  onDiscard(): void;
}

// The question asked before a share is acted on (#190). Any website can post
// to /share-target, so a share is never processed or saved without this tap.
export function ShareConfirm({ confirmation, onConfirm, onDiscard }: ShareConfirmProps) {
  const t = useTranslations("apartments.new");
  const tPrompt = useTranslations("apartments.sharePrompt");
  if (!confirmation) return null;
  const pdf = confirmation.kind === "pdf";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-3 border-frame bg-card p-3 shadow-frame">
      <p className="text-sm font-medium">
        {pdf
          ? t("shareConfirmPdf", { count: confirmation.count })
          : t("shareConfirmLink", { host: confirmation.host })}
      </p>
      <div className="flex gap-2">
        <Button className="min-h-11" onClick={onConfirm}>
          {pdf ? tPrompt("add") : t("shareSave")}
        </Button>
        <Button variant="outline" className="min-h-11" onClick={onDiscard}>
          {tPrompt("discard")}
        </Button>
      </div>
    </div>
  );
}
