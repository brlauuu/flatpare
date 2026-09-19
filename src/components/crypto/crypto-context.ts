"use client";

import { createContext, useContext } from "react";
import type { StoredKeys } from "@/lib/crypto";
import type { StatusResponse } from "./flows";

// The context, its type and its hook, deliberately in a module of their own
// (#255).
//
// They used to live in crypto-provider.tsx, which made three import cycles:
// the provider imports the screens in order to render them, and each screen
// imported `useCrypto` back from the provider. All four files sit in one
// directory, so enola's module-level cycle gate structurally cannot see them
// — the blind spot AGENTS.md already records as a known limit. Keeping the
// context here means the screens depend on this leaf instead, and the
// provider is free to import them.
//
// Nothing but types and the context belongs in this file. Anything that
// imports a screen would put the cycle straight back.

export type CryptoState =
  | "loading"
  | "error"
  | "off"
  | "needs-setup"
  | "pending-wrap"
  // Key pair on this device, unlocked, but the household has no data key and
  // this user owns it (#220): they can create one.
  | "needs-household-key"
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
  // needs-household-key only: creates the household's data key with the key
  // pair already on this device, then shows the recovery kit.
  createHouseholdKey: () => Promise<void>;
  // Task 12's recover/regenerate flows hand their fresh code here so the kit
  // is shown through the same one-time screen as setup.
  showRecoveryKit: (code: string) => void;
}

// Exported so component tests can render consumers under a hand-built value.
export const CryptoContext = createContext<CryptoContextValue | null>(null);

export function useCrypto(): CryptoContextValue {
  const ctx = useContext(CryptoContext);
  if (!ctx) throw new Error("useCrypto must be used inside <CryptoProvider>");
  return ctx;
}
