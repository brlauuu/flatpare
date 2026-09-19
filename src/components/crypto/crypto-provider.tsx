"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isKeyStorePersistent, loadKeys, type StoredKeys } from "@/lib/crypto";
import type { EncryptionMode } from "@/lib/encryption-mode";
import {
  fetchStatus,
  runAdoptWrap,
  runCreateHouseholdKey,
  runFulfilPendingWraps,
  runLock,
  runSetup,
  runUnlock,
  type StatusResponse,
} from "./flows";
import {
  CryptoContext,
  type CryptoContextValue,
  type CryptoState,
} from "./crypto-context";
import { ForgotPassphrase } from "./forgot-passphrase";
import { RecoveryKit } from "./recovery-kit";
import { SetupScreen } from "./setup-screen";
import { UnlockScreen } from "./unlock-screen";
import { PendingScreen } from "./pending-screen";
import { HouseholdKeyScreen } from "./household-key-screen";

const PENDING_POLL_MS = 15_000;
const WRAP_SWEEP_MS = 60_000;
const NOTICE_MS = 8_000;

// A wrap arrived but our private key cannot open it — the wrap was made for a
// public key we have since replaced (see fulfilWraps' binding check), or it is
// garbage. This is not a terminal error: the way out is a reset (so somebody
// can send a fresh wrap) or the recovery kit, both offered on the pending
// screen, so we land there rather than in `error`.
const ADOPT_FAILED_MESSAGE =
  "The key we received could not be opened. Reset your keys so a member can " +
  "send a new one, or use your recovery kit.";

function deriveState(status: StatusResponse, keys: StoredKeys | null): CryptoState {
  if (status.mode === "off") return "off";
  if (!status.memberKeys) return "needs-setup";
  if (!keys) return "locked";
  if (keys.dataKey) return "unlocked";
  // Private key on this device, no data key yet: a wrap arrived and load()
  // will adopt it on the next pass; or nobody has wrapped to us (pending);
  // or there is nothing to wrap because the household has no key and we own
  // it (#220: after leaving or being removed from another household).
  if (status.wrap) return "locked";
  if (status.role === "owner" && !status.householdHasWraps) return "needs-household-key";
  return "pending-wrap";
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

export function CryptoProvider({
  mode,
  children,
}: {
  mode: EncryptionMode;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<CryptoState>(mode === "off" ? "off" : "loading");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [keys, setKeys] = useState<StoredKeys | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [persistent, setPersistent] = useState(true);
  const [kitCode, setKitCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adoptFailed, setAdoptFailed] = useState(false);
  const sweeping = useRef(false);

  // Keeps the previous keys object when nothing about it changed: loadKeys
  // returns fresh CryptoKey objects every time, and a new identity would make
  // the household store (which keys its reload on `dataKey`) refetch and
  // re-decrypt everything on every periodic refresh.
  const apply = useCallback((s: StatusResponse, k: StoredKeys | null) => {
    setStatus(s);
    setKeys((prev) =>
      prev &&
      k &&
      prev.userId === k.userId &&
      prev.householdId === k.householdId &&
      (prev.keyVersion ?? 1) === (k.keyVersion ?? 1) &&
      !!prev.dataKey === !!k.dataKey
        ? prev
        : k
    );
    setPersistent(isKeyStorePersistent());
    setState(deriveState(s, k));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchStatus();
      let k = s.mode === "off" ? null : await loadKeys(s.userId, s.householdId);
      // Adopt the wrap when we have none, or when the household's key was
      // rotated (#219) and the one we hold is an older version. The private
      // key on this device opens the new wrap, so no passphrase is needed.
      const outdated =
        !!k?.dataKey &&
        s.wrapKeyVersion !== null &&
        (k.keyVersion ?? 1) !== s.wrapKeyVersion;
      if (k && s.wrap && (!k.dataKey || outdated)) {
        try {
          k = await runAdoptWrap(s, k);
        } catch {
          // Keep the device keys as they are (no data key) and show the
          // pending screen with its escape hatches instead of the dead-end
          // error screen. deriveState would say "locked" here, because a wrap
          // exists — so the state is set by hand.
          setError(null);
          setAdoptFailed(true);
          setStatus(s);
          setKeys(k);
          setPersistent(isKeyStorePersistent());
          setState("pending-wrap");
          return;
        }
      }
      setError(null);
      setAdoptFailed(false);
      apply(s, k);
    } catch (err) {
      setError(describe(err));
      setState("error");
    }
  }, [apply]);

  useEffect(() => {
    if (mode === "off") return;
    void (async () => {
      await refresh();
    })();
  }, [mode, refresh]);

  // pending-wrap: poll until a wrap arrives.
  useEffect(() => {
    if (state !== "pending-wrap") return;
    const id = setInterval(() => void refresh(), PENDING_POLL_MS);
    return () => clearInterval(id);
  }, [state, refresh]);

  // unlocked: let pending members in, now and periodically — and re-read the
  // status on the same beat, so a rotation by the owner (#219) reaches this
  // device within a minute and refresh() adopts the new wrap. `apply` keeps
  // the keys object stable when nothing changed, so the periodic refresh
  // does not make the household store reload.
  useEffect(() => {
    if (state !== "unlocked" || !status || !keys) return;
    const sweep = async () => {
      if (sweeping.current) return;
      sweeping.current = true;
      try {
        const { count, names } = await runFulfilPendingWraps(status, keys);
        if (count > 0) setNotice(`${names.join(", ")} can now open Flatpare.`);
      } catch (err) {
        console.error("[crypto:wraps]", err);
      } finally {
        sweeping.current = false;
      }
    };
    void sweep();
    const id = setInterval(() => {
      void sweep();
      void refresh();
    }, WRAP_SWEEP_MS);
    return () => clearInterval(id);
  }, [state, status, keys, refresh]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);

  const setup = useCallback(
    async (passphrase: string) => {
      if (!status) throw new Error("Status not loaded");
      const { recoveryCode } = await runSetup(status, passphrase);
      if (recoveryCode) setKitCode(recoveryCode);
      await refresh();
    },
    [status, refresh]
  );

  const unlock = useCallback(
    async (passphrase: string) => {
      if (!status) throw new Error("Status not loaded");
      const k = await runUnlock(status, passphrase);
      apply(status, k);
    },
    [status, apply]
  );

  const lock = useCallback(async () => {
    await runLock();
    if (status) apply(status, null);
  }, [status, apply]);

  const createHouseholdKey = useCallback(async () => {
    if (!status || !keys) throw new Error("Keys not loaded");
    const { recoveryCode } = await runCreateHouseholdKey(status, keys);
    setKitCode(recoveryCode);
    await refresh();
  }, [status, keys, refresh]);

  const value: CryptoContextValue = {
    state,
    status,
    keys,
    error,
    persistent,
    refresh,
    setup,
    unlock,
    lock,
    createHouseholdKey,
    showRecoveryKit: setKitCode,
  };

  let body: React.ReactNode;
  if (kitCode) {
    body = <RecoveryKit code={kitCode} onContinue={() => setKitCode(null)} />;
  } else {
    switch (state) {
      case "off":
      case "unlocked":
        body = children;
        break;
      case "loading":
        body = <p className="text-sm text-muted-foreground">Loading…</p>;
        break;
      case "error":
        body = (
          <div className="mx-auto max-w-md space-y-2">
            <p className="text-sm text-destructive">{error}</p>
            <button type="button" className="text-sm underline" onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        );
        break;
      case "needs-setup":
        body = <SetupScreen />;
        break;
      case "pending-wrap":
        body = (
          <PendingScreen
            pollMs={PENDING_POLL_MS}
            problem={adoptFailed ? ADOPT_FAILED_MESSAGE : null}
            extra={<ForgotPassphrase />}
          />
        );
        break;
      case "needs-household-key":
        body = <HouseholdKeyScreen />;
        break;
      case "locked":
        body = <UnlockScreen extra={<ForgotPassphrase />} />;
        break;
    }
  }

  return (
    <CryptoContext.Provider value={value}>
      {body}
      {notice && (
        <div
          role="status"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 rounded-md border bg-background px-4 py-2 text-sm shadow sm:bottom-6"
        >
          {notice}
        </div>
      )}
    </CryptoContext.Provider>
  );
}
