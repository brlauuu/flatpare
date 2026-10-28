"use client";

import { useSyncExternalStore } from "react";
import { installState, type InstallState } from "@/lib/install-state";

// The browser's install prompt (#190). Chrome fires `beforeinstallprompt`
// once, early, and may do so before React has hydrated anything, so the
// listener is added when this module loads rather than in an effect. The
// event can be used for one prompt only; after that, or once the app is
// installed, it is dropped.

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

let deferred: InstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Without preventDefault, Chrome shows its own banner instead.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    notify();
  });
}

function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  let displayStandalone = false;
  try {
    displayStandalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  } catch {
    // No matchMedia (an old browser, a test environment): not installed.
  }
  return installedNow || iosStandalone || displayStandalone;
}

function snapshot(): InstallState {
  return installState({
    standalone: isStandalone(),
    canPrompt: deferred !== null,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Shows the browser's own install prompt; does nothing without one. */
export async function promptInstall(): Promise<void> {
  const event = deferred;
  if (!event) return;
  deferred = null;
  notify();
  try {
    await event.prompt();
  } catch {
    // The browser refused (already shown, say); the item is gone either way.
  }
}

export function useInstallState(): InstallState {
  // The server cannot know, so it renders nothing install-related.
  return useSyncExternalStore(subscribe, snapshot, () => "none");
}
