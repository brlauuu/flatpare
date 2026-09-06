"use client";

export function PendingScreen() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Almost there</h1>
      <p className="text-sm text-muted-foreground">
        Waiting for someone in your household to open Flatpare. They don&apos;t
        need to do anything — it happens automatically.
      </p>
      <p className="text-sm text-muted-foreground">
        This page checks again every 15 seconds.
      </p>
    </div>
  );
}
