import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StatusResponse } from "../flows";
import type { StoredKeys } from "@/lib/crypto";

const flows = vi.hoisted(() => ({
  fetchStatus: vi.fn(),
  runSetup: vi.fn(),
  runUnlock: vi.fn(),
  runAdoptWrap: vi.fn(),
  runFulfilPendingWraps: vi.fn(),
  runLock: vi.fn(),
}));
const store = vi.hoisted(() => ({
  loadKeys: vi.fn(),
  clearKeys: vi.fn(),
  isKeyStorePersistent: vi.fn(() => true),
}));

vi.mock("../flows", async () => {
  const actual = await vi.importActual<typeof import("../flows")>("../flows");
  return { ...actual, ...flows };
});
vi.mock("@/lib/crypto", () => store);

import { CryptoProvider, useCrypto } from "../crypto-provider";
import { FlowError } from "../flows";

// Stand-ins: the provider never inspects a CryptoKey, it only passes them on.
const fakeKey = {} as CryptoKey;
const keysWithData: StoredKeys = { userId: "u", householdId: 1, privateKey: fakeKey, dataKey: fakeKey };
const keysPending: StoredKeys = { ...keysWithData, dataKey: null };

const member = {
  publicKey: "pub",
  wrappedPrivateKey: "w",
  privateKeyIv: "iv",
  kdf: { salt: "s", memoryKib: 65536, iterations: 3, parallelism: 1, version: 1 as const },
};

const recovery = { wrappedKey: "rk", iv: "riv", kdf: member.kdf };

function status(over: Partial<StatusResponse> = {}): StatusResponse {
  return {
    mode: "on",
    userId: "u",
    householdId: 1,
    role: "owner",
    memberKeys: null,
    wrap: null,
    householdHasWraps: false,
    othersHaveWraps: false,
    recovery: null,
    ...over,
  };
}

function Page() {
  const { state, keys } = useCrypto();
  return (
    <div>
      page:{state}:{keys?.dataKey ? "has-key" : "no-key"}
    </div>
  );
}

function renderApp(mode: "on" | "off" = "on") {
  return render(
    <CryptoProvider mode={mode}>
      <Page />
    </CryptoProvider>
  );
}

beforeEach(() => {
  store.loadKeys.mockResolvedValue(null);
  store.clearKeys.mockResolvedValue(undefined);
  store.isKeyStorePersistent.mockReturnValue(true);
  flows.runFulfilPendingWraps.mockResolvedValue({ count: 0, names: [] });
  flows.runLock.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CryptoProvider", () => {
  it("off mode renders children without calling the API", async () => {
    renderApp("off");
    expect(await screen.findByText("page:off:no-key")).toBeInTheDocument();
    expect(flows.fetchStatus).not.toHaveBeenCalled();
    expect(store.loadKeys).not.toHaveBeenCalled();
  });

  it("shows the error state when status cannot be loaded", async () => {
    flows.fetchStatus.mockRejectedValue(new FlowError("Not authenticated", "http"));
    renderApp();
    expect(await screen.findByText(/Not authenticated/)).toBeInTheDocument();
    expect(screen.queryByText(/^page:/)).not.toBeInTheDocument();
  });

  describe("needs-setup", () => {
    beforeEach(() => {
      flows.fetchStatus.mockResolvedValue(status());
    });

    it("refuses short or mismatched passphrases without calling runSetup", async () => {
      const user = userEvent.setup();
      renderApp();
      const pass = await screen.findByLabelText(/^Passphrase$/i);
      const confirm = screen.getByLabelText(/Confirm passphrase/i);
      const submit = screen.getByRole("button", { name: /Create my keys/i });

      await user.type(pass, "short");
      await user.type(confirm, "short");
      await user.click(submit);
      expect(await screen.findByText(/at least 12 characters/i)).toBeInTheDocument();

      await user.clear(pass);
      await user.clear(confirm);
      await user.type(pass, "long enough passphrase");
      await user.type(confirm, "long enough passphrasX");
      await user.click(submit);
      expect(await screen.findByText(/do not match/i)).toBeInTheDocument();
      expect(flows.runSetup).not.toHaveBeenCalled();
    });

    it("owner setup shows the recovery kit, then the page after acknowledgement", async () => {
      const user = userEvent.setup();
      flows.runSetup.mockImplementation(async () => {
        flows.fetchStatus.mockResolvedValue(status({ memberKeys: member, wrap: "wrap", householdHasWraps: true }));
        store.loadKeys.mockResolvedValue(keysWithData);
        return { recoveryCode: "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY" };
      });
      renderApp();
      await user.type(await screen.findByLabelText(/^Passphrase$/i), "long enough passphrase");
      await user.type(screen.getByLabelText(/Confirm passphrase/i), "long enough passphrase");
      await user.click(screen.getByRole("button", { name: /Create my keys/i }));

      expect(await screen.findByText("ABCDE-FGHIJ-KLMNO-PQRST-UVWXY")).toBeInTheDocument();
      expect(flows.runSetup).toHaveBeenCalledWith(expect.objectContaining({ role: "owner" }), "long enough passphrase");
      expect(screen.queryByText(/^page:/)).not.toBeInTheDocument();

      await user.click(screen.getByRole("checkbox"));
      await user.click(screen.getByRole("button", { name: /continue/i }));
      expect(await screen.findByText("page:unlocked:has-key")).toBeInTheDocument();
    });

    it("member setup goes straight to pending-wrap", async () => {
      const user = userEvent.setup();
      flows.fetchStatus.mockResolvedValue(status({ role: "member", householdHasWraps: true }));
      flows.runSetup.mockImplementation(async () => {
        flows.fetchStatus.mockResolvedValue(status({ role: "member", householdHasWraps: true, memberKeys: member }));
        store.loadKeys.mockResolvedValue(keysPending);
        return { recoveryCode: null };
      });
      renderApp();
      await user.type(await screen.findByLabelText(/^Passphrase$/i), "long enough passphrase");
      await user.type(screen.getByLabelText(/Confirm passphrase/i), "long enough passphrase");
      await user.click(screen.getByRole("button", { name: /Create my keys/i }));
      expect(
        await screen.findByText(/Waiting for someone in your household to open Flatpare/)
      ).toBeInTheDocument();
    });
  });

  describe("locked", () => {
    beforeEach(() => {
      flows.fetchStatus.mockResolvedValue(status({ memberKeys: member, wrap: "wrap", householdHasWraps: true }));
    });

    it("shows wrong-passphrase and then unlocks; fulfils pending wraps and announces them", async () => {
      const user = userEvent.setup();
      flows.runUnlock
        .mockRejectedValueOnce(new FlowError("Wrong passphrase", "wrong-passphrase"))
        .mockResolvedValueOnce(keysWithData);
      flows.runFulfilPendingWraps.mockResolvedValue({ count: 1, names: ["Bob"] });
      renderApp();

      const pass = await screen.findByLabelText(/^Passphrase$/i);
      await user.type(pass, "nope nope nope");
      await user.click(screen.getByRole("button", { name: /^Unlock$/i }));
      expect(await screen.findByText(/Wrong passphrase/)).toBeInTheDocument();
      expect(screen.queryByText(/^page:/)).not.toBeInTheDocument();

      await user.clear(pass);
      await user.type(pass, "correct passphrase");
      await user.click(screen.getByRole("button", { name: /^Unlock$/i }));
      expect(await screen.findByText("page:unlocked:has-key")).toBeInTheDocument();
      await waitFor(() => expect(flows.runFulfilPendingWraps).toHaveBeenCalledTimes(1));
      expect(await screen.findByText(/Bob can now open Flatpare/)).toBeInTheDocument();
    });

    it("warns when the key store is not persistent", async () => {
      store.isKeyStorePersistent.mockReturnValue(false);
      renderApp();
      await screen.findByLabelText(/^Passphrase$/i);
      expect(screen.getByText(/can't remember your keys between visits/i)).toBeInTheDocument();
    });
  });

  describe("pending-wrap", () => {
    it("polls status every 15 s and adopts the wrap when it arrives", async () => {
      vi.useFakeTimers();
      store.loadKeys.mockResolvedValue(keysPending);
      flows.fetchStatus.mockResolvedValue(status({ role: "member", memberKeys: member, householdHasWraps: true }));
      renderApp();
      await act(async () => {});
      expect(screen.getByText(/Waiting for someone in your household/)).toBeInTheDocument();
      expect(flows.fetchStatus).toHaveBeenCalledTimes(1);

      flows.fetchStatus.mockResolvedValue(
        status({ role: "member", memberKeys: member, householdHasWraps: true, wrap: "wrap" })
      );
      flows.runAdoptWrap.mockResolvedValue(keysWithData);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      expect(flows.fetchStatus).toHaveBeenCalledTimes(2);
      expect(flows.runAdoptWrap).toHaveBeenCalledWith(expect.objectContaining({ wrap: "wrap" }), keysPending);
      expect(screen.getByText("page:unlocked:has-key")).toBeInTheDocument();
    });

    it("offers the recovery kit from the pending screen", async () => {
      const user = userEvent.setup();
      store.loadKeys.mockResolvedValue(keysPending);
      flows.fetchStatus.mockResolvedValue(
        status({ role: "member", memberKeys: member, householdHasWraps: true, recovery })
      );
      renderApp();
      await user.click(
        await screen.findByRole("button", { name: /Forgot your passphrase/i })
      );
      expect(screen.getByRole("button", { name: /Use my recovery kit/i })).toBeInTheDocument();
      // Nobody else holds the key, so a reset would be a dead end.
      expect(screen.queryByRole("button", { name: /Reset my keys/i })).not.toBeInTheDocument();
    });

    it("lands in pending-wrap, not error, when an arrived wrap cannot be opened", async () => {
      store.loadKeys.mockResolvedValue(keysPending);
      flows.fetchStatus.mockResolvedValue(
        status({ role: "member", memberKeys: member, householdHasWraps: true, wrap: "wrap" })
      );
      flows.runAdoptWrap.mockRejectedValue(new Error("OperationError"));
      renderApp();
      expect(
        await screen.findByText(/The key we received could not be opened/)
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Try again/i })).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Forgot your passphrase/i })
      ).toBeInTheDocument();
    });
  });

  describe("unlocked", () => {
    it("renders children immediately when keys are on the device, and lock() returns to the unlock screen", async () => {
      store.loadKeys.mockResolvedValue(keysWithData);
      flows.fetchStatus.mockResolvedValue(status({ memberKeys: member, wrap: "wrap", householdHasWraps: true }));
      function LockButton() {
        const { lock } = useCrypto();
        return <button onClick={() => lock()}>lock now</button>;
      }
      const user = userEvent.setup();
      render(
        <CryptoProvider mode="on">
          <Page />
          <LockButton />
        </CryptoProvider>
      );
      expect(await screen.findByText("page:unlocked:has-key")).toBeInTheDocument();
      await user.click(screen.getByText("lock now"));
      expect(flows.runLock).toHaveBeenCalled();
      expect(await screen.findByLabelText(/^Passphrase$/i)).toBeInTheDocument();
    });
  });
});
