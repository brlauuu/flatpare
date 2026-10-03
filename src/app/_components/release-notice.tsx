"use client";

import { useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { useIsClient } from "./use-is-client";

const STORAGE_KEY = "flatpare.release-notice.dismissed";

// Which version the visitor dismissed, if any. Browser storage is a
// convenience here: it can be unavailable (private mode, blocked site data)
// and then the notice simply comes back on the next visit.
function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function rememberDismissed(version: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, version);
  } catch {
    // Nothing to do: it is dismissed for this page view either way.
  }
}

// "New release vX.Y.Z — What's changed →" in the nav (#301). The server
// decides whether the release is recent enough to mention at all; this
// component only handles dismissal, which is remembered per version, so the
// next release shows again. Rendered after mount, because whether it was
// dismissed is only known in the browser.
export function ReleaseNotice({ version, href }: { version: string; href: string }) {
  const mounted = useIsClient();
  const stored = useSyncExternalStore(
    () => () => {},
    readDismissed,
    () => null
  );
  const [dismissed, setDismissed] = useState(false);

  if (!mounted || dismissed || stored === version) return null;

  return (
    <div
      role="status"
      className="flex max-w-full items-center gap-x-2.5 whitespace-nowrap border-[3px] border-(--lp-card-line) bg-(--lp-surface) py-1 pr-1 pl-3 text-sm shadow-(--lp-toast-shadow)"
    >
      {/* Visually dropped on phones to keep the notice on one line; screen
          readers still hear it. */}
      <span className="font-semibold max-sm:sr-only">New release</span>
      <span className="lp-mono bg-(--lp-accent) px-2 py-0.5 text-[13px] font-semibold text-(--lp-on-accent)">
        v{version}
      </span>
      <a href={href} className="font-semibold text-(--lp-accent-text) no-underline hover:underline">
        What&apos;s changed →
      </a>
      <button
        type="button"
        aria-label="Dismiss release notice"
        onClick={() => {
          setDismissed(true);
          rememberDismissed(version);
        }}
        className="grid size-8 cursor-pointer place-items-center text-(--lp-muted) hover:text-(--lp-ink)"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
