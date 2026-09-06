"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCrypto } from "./crypto-provider";

export function UnlockScreen({ extra }: { extra?: React.ReactNode }) {
  const { unlock, persistent } = useCrypto();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await unlock(passphrase);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <form onSubmit={onSubmit} className="space-y-4">
        <h1 className="text-xl font-semibold">Unlock Flatpare</h1>
        <p className="text-sm text-muted-foreground">
          Enter your passphrase to decrypt your household&apos;s data on this
          device.
        </p>
        {!persistent && (
          <p className="text-sm text-muted-foreground">
            This browser can&apos;t remember your keys between visits (private
            browsing?), so you&apos;ll be asked for your passphrase each time.
          </p>
        )}
        <div className="space-y-1">
          <Label htmlFor="unlock-passphrase">Passphrase</Label>
          <Input
            id="unlock-passphrase"
            type="password"
            autoComplete="current-password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy || passphrase.length === 0}>
          {busy ? "Unlocking…" : "Unlock"}
        </Button>
      </form>
      {extra}
    </div>
  );
}
