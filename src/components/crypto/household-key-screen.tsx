"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCrypto } from "./crypto-context";

// Shown to an owner whose household has no data key yet while they already
// have a key pair (#220): they left, or were removed from, another household
// and now own a fresh one. One click creates the key and the recovery kit.
export function HouseholdKeyScreen() {
  const { createHouseholdKey } = useCrypto();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await createHouseholdKey();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the household key");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-semibold">A new household</h1>
      <p className="text-sm text-muted-foreground">
        This household has no encryption key yet. Creating one makes it yours:
        everything you add is encrypted under it, and you will get a new
        recovery code to keep.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="button" disabled={busy} onClick={() => void create()}>
        {busy ? "Creating…" : "Create the household key"}
      </Button>
    </div>
  );
}
