"use client";

import { useTranslations } from "next-intl";
import { Dialog } from "@base-ui/react/dialog";
import { Share, X } from "lucide-react";

// How to install on an iPhone or iPad (#190), which offers no prompt.
export function InstallHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("nav.install");
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto border-3 border-frame bg-card text-card-foreground shadow-frame">
          <div className="flex items-center justify-between border-b-3 border-frame py-1 pr-1 pl-4">
            <Dialog.Title className="title-section">{t("howTitle")}</Dialog.Title>
            <Dialog.Close
              aria-label={t("close")}
              className="grid size-11 cursor-pointer place-items-center text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </div>
          <div className="space-y-3 p-4 text-sm">
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                {t.rich("howShare", {
                  icon: () => <Share className="inline size-4 align-text-bottom" aria-hidden />,
                })}
              </li>
              <li>{t("howAdd")}</li>
              <li>{t("howOpen")}</li>
            </ol>
            <p className="text-muted-foreground">{t("howPaste")}</p>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
