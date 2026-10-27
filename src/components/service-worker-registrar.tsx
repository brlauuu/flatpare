"use client";

import { useEffect } from "react";

// Registers public/sw.js, which only receives shares (#190). Mounted in the
// root layout so the landing page registers too: Android offers a share
// target only for an installed app, and installing can precede sign-in.
// Without support, or when registration fails, sharing falls back to the
// /share-target route and everything else is unaffected.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    try {
      navigator.serviceWorker?.register("/sw.js").catch(() => {});
    } catch {
      // Some browsers throw synchronously (a private window); nothing to do.
    }
  }, []);
  return null;
}
