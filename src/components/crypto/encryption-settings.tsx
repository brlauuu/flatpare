"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCrypto } from "./crypto-provider";
import { runChangePassphrase, runRegenerateRecovery } from "./flows";
import { MIN_PASSPHRASE_LENGTH } from "./setup-screen";

export function EncryptionSettings() {
  const { state, status, keys, lock, refresh, showRecoveryKit } = useCrypto();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state === "off" || !status) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Encryption</h2>
        <p className="text-sm text-muted-foreground">
          Encryption: off — set by this deployment.
        </p>
      </section>
    );
  }

  async function changePassphrase(e: React.FormEvent) {
    e.preventDefault();
    if (!status) return;
    setError(null);
    setMessage(null);
    if (next.length < MIN_PASSPHRASE_LENGTH) {
      return setError(`Use at least ${MIN_PASSPHRASE_LENGTH} characters.`);
    }
    if (next !== confirm) return setError("The passphrases do not match.");
    setBusy(true);
    try {
      await runChangePassphrase(status, current, next);
      await refresh();
      setCurrent("");
      setNext("");
      setConfirm("");
      setMessage("Passphrase changed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change passphrase");
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    if (!status || !keys) return;
    setError(null);
    setBusy(true);
    try {
      const { recoveryCode } = await runRegenerateRecovery(status, keys);
      await refresh();
      showRecoveryKit(recoveryCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not regenerate the kit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Encryption</h2>

      <form onSubmit={changePassphrase} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="enc-current">Current passphrase</Label>
          <Input
            id="enc-current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="enc-next">New passphrase</Label>
          <Input
            id="enc-next"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="enc-confirm">Confirm new passphrase</Label>
          <Input
            id="enc-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {message && <p className="text-sm">{message}</p>}
        <Button type="submit" disabled={busy}>
          Change passphrase
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void lock()}>
          Lock this device
        </Button>
        {status.role === "owner" && (
          <Button type="button" variant="outline" disabled={busy} onClick={regenerate}>
            Regenerate recovery kit
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Locking clears the keys from this browser; you will need your
        passphrase next time. Regenerating the recovery kit replaces the old
        code — the old one stops working immediately.
      </p>
    </section>
  );
}
