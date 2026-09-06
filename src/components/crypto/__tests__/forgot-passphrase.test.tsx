import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StatusResponse } from "../flows";

const flows = vi.hoisted(() => ({
  runResetKeys: vi.fn(),
  runRecover: vi.fn(),
}));
vi.mock("../flows", async () => {
  const actual = await vi.importActual<typeof import("../flows")>("../flows");
  return { ...actual, ...flows };
});

import { CryptoContext, type CryptoContextValue } from "../crypto-provider";
import { ForgotPassphrase } from "../forgot-passphrase";
import { FlowError } from "../flows";

const member = {
  publicKey: "pub",
  wrappedPrivateKey: "w",
  privateKeyIv: "iv",
  kdf: { salt: "s", memoryKib: 65536, iterations: 3, parallelism: 1, version: 1 as const },
};
const recovery = { wrappedKey: "rk", iv: "riv", kdf: member.kdf };

function ctx(over: Partial<StatusResponse> = {}): CryptoContextValue {
  return {
    state: "locked",
    status: {
      mode: "on",
      userId: "u",
      householdId: 1,
      role: "owner",
      memberKeys: member,
      wrap: "wrap",
      householdHasWraps: true,
      recovery: null,
      ...over,
    },
    keys: null,
    error: null,
    persistent: true,
    refresh: vi.fn(async () => {}),
    setup: vi.fn(async () => {}),
    unlock: vi.fn(async () => {}),
    lock: vi.fn(async () => {}),
    showRecoveryKit: vi.fn(),
  };
}

function renderWith(value: CryptoContextValue) {
  return render(
    <CryptoContext.Provider value={value}>
      <ForgotPassphrase />
    </CryptoContext.Provider>
  );
}

beforeEach(() => {
  flows.runResetKeys.mockResolvedValue(undefined);
});
afterEach(() => cleanup());

describe("ForgotPassphrase", () => {
  it("is collapsed until clicked and hides the recovery option without a kit", async () => {
    const user = userEvent.setup();
    renderWith(ctx());
    expect(screen.queryByText(/Reset my keys/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Forgot your passphrase/i }));
    expect(screen.getByRole("button", { name: /Reset my keys/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Use my recovery kit/i })).not.toBeInTheDocument();
  });

  it("reset asks for a new passphrase, calls runResetKeys, and refreshes", async () => {
    const user = userEvent.setup();
    const value = ctx();
    renderWith(value);
    await user.click(screen.getByRole("button", { name: /Forgot your passphrase/i }));
    await user.click(screen.getByRole("button", { name: /Reset my keys/i }));
    await user.type(screen.getByLabelText(/^New passphrase$/i), "a brand new passphrase");
    await user.type(screen.getByLabelText(/Confirm new passphrase/i), "a brand new passphrase");
    await user.click(screen.getByRole("button", { name: /Reset and wait/i }));
    expect(flows.runResetKeys).toHaveBeenCalledWith(value.status, "a brand new passphrase");
    expect(value.refresh).toHaveBeenCalled();
  });

  it("recover rejects a bad code, then shows the new kit on success", async () => {
    const user = userEvent.setup();
    const value = ctx({ recovery });
    flows.runRecover
      .mockRejectedValueOnce(new FlowError("That recovery code is not valid", "bad-recovery-code"))
      .mockResolvedValueOnce({ recoveryCode: "NEWCO-DENEW-CODEN-EWCOD-ENEWC" });
    renderWith(value);
    await user.click(screen.getByRole("button", { name: /Forgot your passphrase/i }));
    await user.click(screen.getByRole("button", { name: /Use my recovery kit/i }));

    await user.type(screen.getByLabelText(/Recovery code/i), "bad code");
    await user.type(screen.getByLabelText(/^New passphrase$/i), "a brand new passphrase");
    await user.type(screen.getByLabelText(/Confirm new passphrase/i), "a brand new passphrase");
    await user.click(screen.getByRole("button", { name: /^Recover$/i }));
    expect(await screen.findByText(/not valid/)).toBeInTheDocument();
    expect(value.showRecoveryKit).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/Recovery code/i));
    await user.type(screen.getByLabelText(/Recovery code/i), "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY");
    await user.click(screen.getByRole("button", { name: /^Recover$/i }));
    expect(await screen.findByText(/old recovery kit no longer works/i)).toBeInTheDocument();
    expect(flows.runRecover).toHaveBeenLastCalledWith(
      value.status,
      "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY",
      "a brand new passphrase"
    );
    expect(value.showRecoveryKit).toHaveBeenCalledWith("NEWCO-DENEW-CODEN-EWCOD-ENEWC");
    expect(value.refresh).toHaveBeenCalled();
  });
});
