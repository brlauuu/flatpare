import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CryptoContext, type CryptoContextValue } from "@/components/crypto/crypto-context";
import { HouseholdSettings } from "../household-settings";
import { HouseholdDataContext } from "@/components/household-data/household-data-provider";
import { makeHouseholdData } from "@/components/household-data/__tests__/fake-household-data";
import type { Limits } from "@/lib/limits";

const fetchMock = vi.fn();

function jsonRes(body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const members = [
  { userId: "o", name: "Ana", email: "ana@example.com", role: "owner", hasWrap: true },
  { userId: "m", name: null, email: "bob@example.com", role: "member", hasWrap: false },
];
const invites = [
  { id: 4, email: "cara@example.com", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), createdAt: new Date().toISOString() },
];

const showRecoveryKit = vi.fn();
let cryptoStatus: CryptoContextValue["status"] = null;

function cryptoValue(state: CryptoContextValue["state"]): CryptoContextValue {
  return {
    state,
    status: cryptoStatus,
    keys: null,
    error: null,
    persistent: true,
    refresh: vi.fn(async () => {}),
    setup: vi.fn(async () => {}),
    unlock: vi.fn(async () => {}),
    createHouseholdKey: vi.fn(async () => {}),
    lock: vi.fn(async () => {}),
    showRecoveryKit,
  };
}

let householdData = makeHouseholdData();

function renderAs(
  me: { userId: string; role: "owner" | "member" },
  state: CryptoContextValue["state"] = "unlocked",
  limits: Limits = { maxMembers: null, maxApartments: null }
) {
  householdData = makeHouseholdData({ limits });
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === "/api/household/members") return jsonRes({ members, me });
    if (url === "/api/invitations" && method === "GET") return jsonRes({ invitations: invites });
    if (url === "/api/invitations" && method === "POST") {
      const body = JSON.parse(String(init?.body));
      if (body.email === "dup@example.com") {
        return jsonRes({ error: "An invitation is already pending for that email" }, 409);
      }
      return jsonRes({ id: 5, email: body.email, expiresAt: invites[0].expiresAt, createdAt: invites[0].createdAt }, 201);
    }
    if (url === "/api/invitations/4" && method === "DELETE") return jsonRes(null, 204);
    if (url === "/api/household/members/m" && method === "DELETE") return jsonRes(null, 204);
    if (url === "/api/household/leave" && method === "POST") return jsonRes({});
    return jsonRes({ error: `unexpected ${method} ${url}` }, 500);
  });
  return render(
    <CryptoContext.Provider value={cryptoValue(state)}>
      <HouseholdDataContext.Provider value={householdData}>
        <HouseholdSettings />
      </HouseholdDataContext.Provider>
    </CryptoContext.Provider>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  showRecoveryKit.mockReset();
  cryptoStatus = null;
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("HouseholdSettings", () => {
  it("lists members with an 'awaiting key' badge for those without a wrap", async () => {
    renderAs({ userId: "o", role: "owner" });
    expect(await screen.findByText("Ana")).toBeInTheDocument();
    const bob = screen.getByText("bob@example.com").closest("li")!;
    expect(within(bob).getByText(/awaiting key/i)).toBeInTheDocument();
    const ana = screen.getByText("Ana").closest("li")!;
    expect(within(ana).queryByText(/awaiting key/i)).not.toBeInTheDocument();
  });

  it("hides the badge when encryption is off", async () => {
    renderAs({ userId: "o", role: "owner" }, "off");
    await screen.findByText("Ana");
    expect(screen.queryByText(/awaiting key/i)).not.toBeInTheDocument();
  });

  it("a member sees no invite form, no pending list, and no remove buttons", async () => {
    renderAs({ userId: "m", role: "member" });
    await screen.findByText("Ana");
    expect(screen.queryByLabelText(/Email/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove/i })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/invitations", expect.anything());
  });

  it("owner invites by email and sees the pending list grow; duplicates show the 409", async () => {
    const user = userEvent.setup();
    renderAs({ userId: "o", role: "owner" });
    expect(await screen.findByText("cara@example.com")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Email/i), "dave@example.com");
    await user.click(screen.getByRole("button", { name: /Invite/i }));
    expect(await screen.findByText("dave@example.com")).toBeInTheDocument();
    expect(screen.getByText(/sign in with that address/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Email/i), "dup@example.com");
    await user.click(screen.getByRole("button", { name: /Invite/i }));
    expect(await screen.findByText(/already pending/i)).toBeInTheDocument();
  });

  it("owner revokes a pending invitation", async () => {
    const user = userEvent.setup();
    renderAs({ userId: "o", role: "owner" });
    const row = (await screen.findByText("cara@example.com")).closest("li")!;
    await user.click(within(row).getByRole("button", { name: /Revoke/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/invitations/4", expect.objectContaining({ method: "DELETE" }))
    );
    await waitFor(() => expect(screen.queryByText("cara@example.com")).not.toBeInTheDocument());
  });

  it("owner removes a member after confirming, never themselves", async () => {
    const user = userEvent.setup();
    renderAs({ userId: "o", role: "owner" });
    const ana = (await screen.findByText("Ana")).closest("li")!;
    expect(within(ana).queryByRole("button", { name: /Remove/i })).not.toBeInTheDocument();
    const bob = screen.getByText("bob@example.com").closest("li")!;
    await user.click(within(bob).getByRole("button", { name: /Remove/i }));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/household/members/m",
        expect.objectContaining({ method: "DELETE" })
      )
    );
  });
});

// E5: the UI mirrors MAX_MEMBERS. The server enforces it regardless — these
// tests are about not offering an action that is guaranteed to 409.
describe("member limit (#187)", () => {
  it("shows no counter when no limit is configured", async () => {
    renderAs({ userId: "o", role: "owner" });
    await screen.findByText("Household");
    expect(screen.queryByText(/ of \d+$/)).not.toBeInTheDocument();
  });

  it("counts members plus pending invitations against the cap", async () => {
    // The fixture has 2 members and 1 pending invitation.
    renderAs({ userId: "o", role: "owner" }, "unlocked", {
      maxMembers: 5,
      maxApartments: null,
    });
    expect(await screen.findByText("3 of 5")).toBeInTheDocument();
  });

  it("disables Invite at the cap and says why", async () => {
    renderAs({ userId: "o", role: "owner" }, "unlocked", {
      maxMembers: 3,
      maxApartments: null,
    });
    await screen.findByText("3 of 3");
    expect(screen.getByRole("button", { name: "Invite" })).toBeDisabled();
    expect(screen.getByText(/limited to 3 members/i)).toBeInTheDocument();
  });

  it("leaves Invite usable below the cap", async () => {
    renderAs({ userId: "o", role: "owner" }, "unlocked", {
      maxMembers: 9,
      maxApartments: null,
    });
    await screen.findByText("3 of 9");
    const email = screen.getByLabelText("Email");
    await userEvent.type(email, "new@example.com");
    expect(screen.getByRole("button", { name: "Invite" })).toBeEnabled();
  });
});

// #219: removing a member rotates the household key and shows the new
// recovery code; a removal whose rotation did not land leaves a warning and
// a button to run it by hand.
describe("HouseholdSettings — data-key rotation", () => {
  const owner = { userId: "o", role: "owner" as const };
  const withStatus = (over: Partial<NonNullable<CryptoContextValue["status"]>>) => {
    cryptoStatus = {
      mode: "on", userId: "o", householdId: 1, role: "owner", memberKeys: null, wrap: "w",
      wrapKeyVersion: 1, keyVersion: 1, rotationDue: false, householdHasWraps: true,
      othersHaveWraps: true, recovery: null, ...over,
    };
  };

  it("rotates after a removal and hands the new recovery code to the kit screen", async () => {
    const user = userEvent.setup();
    withStatus({});
    renderAs(owner);
    const bob = (await screen.findByText("bob@example.com")).closest("li")!;
    await user.click(within(bob).getByRole("button", { name: /remove/i }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/new recovery code/i));
    await waitFor(() => expect(householdData.rotateDataKey).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(showRecoveryKit).toHaveBeenCalledWith("AAAAA-BBBBB-CCCCC-DDDDD-EEEEE"));
    expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument();
  });

  it("says so when the removal landed but the rotation did not", async () => {
    const user = userEvent.setup();
    withStatus({});
    renderAs(owner);
    (householdData.rotateDataKey as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network down"));
    const bob = (await screen.findByText("bob@example.com")).closest("li")!;
    await user.click(within(bob).getByRole("button", { name: /remove/i }));

    expect(await screen.findByText(/was removed, but the household key could not be rotated: network down/i)).toBeInTheDocument();
    expect(showRecoveryKit).not.toHaveBeenCalled();
  });

  it("does not rotate when encryption is off", async () => {
    const user = userEvent.setup();
    renderAs(owner, "off");
    const bob = (await screen.findByText("bob@example.com")).closest("li")!;
    await user.click(within(bob).getByRole("button", { name: /remove/i }));
    await waitFor(() => expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument());
    expect(householdData.rotateDataKey).not.toHaveBeenCalled();
    expect(window.confirm).toHaveBeenCalledWith(expect.not.stringMatching(/recovery code/i));
    expect(screen.queryByText(/household key/i)).not.toBeInTheDocument();
  });

  it("warns while a rotation is due and lets the owner run it by hand", async () => {
    const user = userEvent.setup();
    withStatus({ rotationDue: true, keyVersion: 3 });
    renderAs(owner);
    expect(await screen.findByRole("alert")).toHaveTextContent(/has not been rotated/i);
    expect(screen.getByText(/version 3/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /rotate household key/i }));
    await waitFor(() => expect(householdData.rotateDataKey).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(showRecoveryKit).toHaveBeenCalled());
  });

  it("hides the key block from members", async () => {
    withStatus({ role: "member" });
    renderAs({ userId: "m", role: "member" });
    await screen.findByText("bob@example.com");
    expect(screen.queryByRole("button", { name: /rotate household key/i })).not.toBeInTheDocument();
  });
});

// #220
describe("HouseholdSettings — leave", () => {
  const assign = vi.fn();
  beforeEach(() => {
    Object.defineProperty(window, "location", { value: { ...window.location, assign }, configurable: true });
    assign.mockReset();
  });

  it("lets a member leave after confirming, then navigates to the fresh household", async () => {
    const user = userEvent.setup();
    renderAs({ userId: "m", role: "member" });
    await user.click(await screen.findByRole("button", { name: /leave household/i }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/stays with it/i));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/apartments"));
    expect(fetchMock).toHaveBeenCalledWith("/api/household/leave", expect.objectContaining({ method: "POST" }));
  });

  it("does nothing when the member cancels", async () => {
    const user = userEvent.setup();
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false);
    renderAs({ userId: "m", role: "member" });
    await user.click(await screen.findByRole("button", { name: /leave household/i }));
    expect(fetchMock).not.toHaveBeenCalledWith("/api/household/leave", expect.anything());
    expect(assign).not.toHaveBeenCalled();
  });

  it("does not offer it to the owner", async () => {
    renderAs({ userId: "o", role: "owner" });
    await screen.findByText("Ana");
    expect(screen.queryByRole("button", { name: /leave household/i })).not.toBeInTheDocument();
  });
});
