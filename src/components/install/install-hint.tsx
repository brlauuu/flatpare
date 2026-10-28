"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstallHelpDialog } from "./install-help-dialog";
import { promptInstall, useInstallState } from "./install-prompt";

export const INSTALL_HINT_KEY = "flatpare_install_hint_dismissed";

// Where storage is refused (a private window), dismissal lasts this visit.
let dismissedThisVisit = false;
const listeners = new Set<() => void>();

function readDismissed(): boolean {
  if (dismissedThisVisit) return true;
  try {
    return window.localStorage.getItem(INSTALL_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function dismiss() {
  dismissedThisVisit = true;
  try {
    window.localStorage.setItem(INSTALL_HINT_KEY, "1");
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

// One line on the Apartments list, on a phone only, until dismissed (#190):
// installing is what lets Android share listings into Flatpare, and on an
// iPhone it puts Paste link one tap away.
export function InstallHint() {
  const t = useTranslations("nav.install");
  const state = useInstallState();
  // The server renders it dismissed, so it never flashes in and out.
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);
  const [helpOpen, setHelpOpen] = useState(false);

  if (dismissed || (state !== "prompt" && state !== "ios")) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-2 border-frame bg-card p-2 pl-3 text-sm sm:hidden"
    >
      <p className="flex-1">{state === "prompt" ? t("hintShare") : t("hintPaste")}</p>
      <Button
        type="button"
        size="sm"
        className="h-11 shrink-0"
        onClick={() => (state === "prompt" ? void promptInstall() : setHelpOpen(true))}
      >
        {state === "prompt" ? t("install") : t("how")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={t("dismiss")}
        className="h-11 w-11 shrink-0 p-0"
        onClick={dismiss}
      >
        <X className="h-4 w-4" aria-hidden />
      </Button>
      <InstallHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
