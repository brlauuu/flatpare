import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StatusResponse } from "../flows";
import type { StoredKeys } from "@/lib/crypto";

const flows = vi.hoisted(() => ({
  runChangePassphrase: vi.fn(),
  runRegenerateRecovery: vi.fn(),
}));
vi.mock("../flows", async () => {
  const actual = await vi.importActual<typeof import("../flows")>("../flows");
  return { ...actual, ...flows };
});

import { CryptoContext, type CryptoContextValue } from "../crypto-provider";
import { EncryptionSettings } from "../encryption-settings";
import { FlowError } from "../flows";

const member = {
  publicKey: "pub",
  wrappedPrivateKey: "w",
  privateKeyIv: "iv",
  kdf: { salt: "s", memoryKib: 65536, iterations: 3, parallelism: 1, version: 1 as const },
};
const fakeKey = {} as CryptoKey;
const keys: StoredKeys = { userId: "u", householdId: 1, privateKey: fakeKey, dataKey: fakeKey };

function ctx(over: Partial<CryptoContextValue> = {}, status: Partial<StatusResponse> = {}): CryptoContextValue {
  return {
    state: "unlocked",
    status: {
      mode: "on",
      userId: "u",
      householdId: 1,
      role: "owner",
      memberKeys: member,
      wrap: "wrap",
      householdHasWraps: true,
      recovery: { wrappedKey: "rk", iv: "riv", kdf: member.kdf },
      ...status,
    },
    keys,
    error: null,
    persistent: true,
    refresh: vi.fn(async () => {}),
    setup: vi.fn(async () => {}),
    unlock: vi.fn(async () => {}),
    lock: vi.fn(async () => {}),
    showRecoveryKit: vi.fn(),
    ...over,
  };
}

function renderWith(value: CryptoContextValue) {
  return render(
    <CryptoContext.Provider value={value}>
      <EncryptionSettings />
    </CryptoContext.Provider>
  );
}

beforeEach(() => {
  flows.runChangePassphrase.mockResolvedValue(undefined);
  flows.runRegenerateRecovery.mockResolvedValue({ recoveryCode: "NEWCO-DENEW-CODEN-EWCOD-ENEWC" });
});
afterEach(() => cleanup());

describe("EncryptionSettings", () => {
  it("says so when encryption is off", () => {
    renderWith(ctx({ state: "off", status: null, keys: null }));
    expect(screen.getByText(/Encryption: off — set by this deployment/)).toBeInTheDocument();
    expect(screen.queryByText(/Change passphrase/)).not.toBeInTheDocument();
  });

  it("changes the passphrase and reports the wrong current one", async () => {
    const user = userEvent.setup();
    const value = ctx();
    flows.runChangePassphrase
      .mockRejectedValueOnce(new FlowError("Wrong passphrase", "wrong-passphrase"))
      .mockResolvedValueOnce(undefined);
    renderWith(value);

    await user.type(screen.getByLabelText(/Current passphrase/i), "wrong one here");
    await user.type(screen.getByLabelText(/^New passphrase$/i), "a brand new passphrase");
    await user.type(screen.getByLabelText(/Confirm new passphrase/i), "a brand new passphrase");
    await user.click(screen.getByRole("button", { name: /Change passphrase/i }));
    expect(await screen.findByText(/Wrong passphrase/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Current passphrase/i));
    await user.type(screen.getByLabelText(/Current passphrase/i), "the current one");
    await user.click(screen.getByRole("button", { name: /Change passphrase/i }));
    expect(await screen.findByText(/Passphrase changed/)).toBeInTheDocument();
    expect(flows.runChangePassphrase).toHaveBeenLastCalledWith(
      value.status,
      "the current one",
      "a brand new passphrase"
    );
    expect(value.refresh).toHaveBeenCalled();
  });

  it("locks this device", async () => {
    const user = userEvent.setup();
    const value = ctx();
    renderWith(value);
    await user.click(screen.getByRole("button", { name: /Lock this device/i }));
    expect(value.lock).toHaveBeenCalled();
  });

  it("regenerates the recovery kit for the owner only", async () => {
    const user = userEvent.setup();
    const value = ctx();
    renderWith(value);
    await user.click(screen.getByRole("button", { name: /Regenerate recovery kit/i }));
    expect(flows.runRegenerateRecovery).toHaveBeenCalledWith(value.status, value.keys);
    expect(value.showRecoveryKit).toHaveBeenCalledWith("NEWCO-DENEW-CODEN-EWCOD-ENEWC");
    cleanup();

    renderWith(ctx({}, { role: "member" }));
    expect(screen.queryByRole("button", { name: /Regenerate recovery kit/i })).not.toBeInTheDocument();
  });
});
