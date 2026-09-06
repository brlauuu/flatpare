"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { isKeyStorePersistent, loadKeys, type StoredKeys } from "@/lib/crypto";
import type { EncryptionMode } from "@/lib/encryption-mode";
import {
  fetchStatus,
  runAdoptWrap,
  runFulfilPendingWraps,
  runLock,
  runSetup,
  runUnlock,
  type StatusResponse,
} from "./flows";
import { ForgotPassphrase } from "./forgot-passphrase";
import { RecoveryKit } from "./recovery-kit";
import { SetupScreen } from "./setup-screen";
import { UnlockScreen } from "./unlock-screen";
import { PendingScreen } from "./pending-screen";

export type CryptoState =
  | "loading"
  | "error"
  | "off"
  | "needs-setup"
  | "pending-wrap"
  | "locked"
  | "unlocked";

export interface CryptoContextValue {
  state: CryptoState;
  status: StatusResponse | null;
  keys: StoredKeys | null;
  error: string | null;
  persistent: boolean;
  refresh: () => Promise<void>;
  setup: (passphrase: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => Promise<void>;
  // Task 12's recover/regenerate flows hand their fresh code here so the kit
  // is shown through the same one-time screen as setup.
  showRecoveryKit: (code: string) => void;
}

const PENDING_POLL_MS = 15_000;
const WRAP_SWEEP_MS = 60_000;
const NOTICE_MS = 8_000;

// Exported so component tests can render consumers under a hand-built value.
export const CryptoContext = createContext<CryptoContextValue | null>(null);

export function useCrypto(): CryptoContextValue {
  const ctx = useContext(CryptoContext);
  if (!ctx) throw new Error("useCrypto must be used inside <CryptoProvider>");
  return ctx;
}

function deriveState(status: StatusResponse, keys: StoredKeys | null): CryptoState {
  if (status.mode === "off") return "off";
  if (!status.memberKeys) return "needs-setup";
  if (!keys) return "locked";
  if (keys.dataKey) return "unlocked";
  // Private key on this device, no data key yet: either nobody has wrapped
  // to us (pending) or a wrap arrived and load() will adopt it on next pass.
  return status.wrap ? "locked" : "pending-wrap";
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
  const sweeping = useRef(false);

  const apply = useCallback((s: StatusResponse, k: StoredKeys | null) => {
    setStatus(s);
    setKeys(k);
    setPersistent(isKeyStorePersistent());
    setState(deriveState(s, k));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchStatus();
      let k = s.mode === "off" ? null : await loadKeys(s.userId, s.householdId);
      if (k && !k.dataKey && s.wrap) k = await runAdoptWrap(s, k);
      setError(null);
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

  // unlocked: let pending members in, now and periodically.
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
    const id = setInterval(() => void sweep(), WRAP_SWEEP_MS);
    return () => clearInterval(id);
  }, [state, status, keys]);

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
        body = <PendingScreen />;
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
