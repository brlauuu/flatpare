import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CryptoContext, type CryptoContextValue } from "@/components/crypto/crypto-provider";
import { HouseholdSettings } from "../household-settings";

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

function cryptoValue(state: CryptoContextValue["state"]): CryptoContextValue {
  return {
    state,
    status: null,
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

function renderAs(me: { userId: string; role: "owner" | "member" }, state: CryptoContextValue["state"] = "unlocked") {
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
    return jsonRes({ error: `unexpected ${method} ${url}` }, 500);
  });
  return render(
    <CryptoContext.Provider value={cryptoValue(state)}>
      <HouseholdSettings />
    </CryptoContext.Provider>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
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
