"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCrypto } from "./crypto-provider";

export const MIN_PASSPHRASE_LENGTH = 12;

export function SetupScreen() {
  const { status, setup } = useCrypto();
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const creator = status?.role === "owner" && !status.householdHasWraps;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
      setError(`Use at least ${MIN_PASSPHRASE_LENGTH} characters.`);
      return;
    }
    if (passphrase !== confirm) {
      setError("The passphrases do not match.");
      return;
    }
    setBusy(true);
    try {
      await setup(passphrase);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Choose a passphrase</h1>
      <p className="text-sm text-muted-foreground">
        Flatpare encrypts your household&apos;s data in your browser. This
        passphrase protects your keys; Flatpare never sees it and cannot reset
        it for you.
        {creator
          ? " You will get a recovery kit on the next screen — keep it safe."
          : " Once your keys exist, someone in your household will let you in automatically the next time they open Flatpare."}
      </p>
      <div className="space-y-1">
        <Label htmlFor="setup-passphrase">Passphrase</Label>
        <Input
          id="setup-passphrase"
          type="password"
          autoComplete="new-password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="setup-confirm">Confirm passphrase</Label>
        <Input
          id="setup-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy}>
        {busy ? "Creating keys…" : "Create my keys"}
      </Button>
    </form>
  );
}
