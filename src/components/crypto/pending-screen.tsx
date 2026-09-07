"use client";

export function PendingScreen({
  pollMs,
  problem,
  extra,
}: {
  pollMs: number;
  problem?: string | null;
  extra?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Almost there</h1>
      {problem ? (
        <p className="text-sm text-destructive">{problem}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Waiting for someone in your household to open Flatpare. They
          don&apos;t need to do anything — it happens automatically.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        This page checks again every {Math.round(pollMs / 1000)} seconds.
      </p>
      {extra}
    </div>
  );
}
