import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signOutMock = vi.fn();
vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

import InvitationsPage from "../page";

const fetchMock = vi.fn();
const assign = vi.fn();

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const invitation = {
  id: 7,
  householdName: "Relić household",
  invitedByName: "Ana",
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "location", {
    value: { ...window.location, assign },
    configurable: true,
  });
  assign.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("InvitationsPage", () => {
  it("lists pending invitations with who invited you and when they expire", async () => {
    fetchMock.mockResolvedValue(jsonRes({ invitations: [invitation] }));
    render(<InvitationsPage />);
    expect(await screen.findByText("Relić household")).toBeInTheDocument();
    expect(screen.getByText(/Invited by Ana/)).toBeInTheDocument();
    expect(screen.getByText(/Expires/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/invitations/mine", expect.anything());
  });

  it("accepts an invitation and moves to the apartments page", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/invitations/mine") return jsonRes({ invitations: [invitation] });
      if (url === "/api/invitations/7/accept" && init?.method === "POST") {
        return jsonRes({ householdId: 3 });
      }
      return jsonRes({ error: `unexpected ${url}` }, 500);
    });
    render(<InvitationsPage />);
    await user.click(await screen.findByRole("button", { name: /^Accept$/i }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/apartments"));
  });

  it("shows the server's 409 when the current household cannot be abandoned", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/invitations/mine") return jsonRes({ invitations: [invitation] });
      return jsonRes({ error: "You already belong to a household" }, 409);
    });
    render(<InvitationsPage />);
    await user.click(await screen.findByRole("button", { name: /^Accept$/i }));
    expect(await screen.findByText("You already belong to a household")).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it("'No thanks' starts an own household", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/invitations/mine") return jsonRes({ invitations: [invitation] });
      if (url === "/api/invitations/decline" && init?.method === "POST") {
        return jsonRes({ householdId: 9 });
      }
      return jsonRes({ error: `unexpected ${url}` }, 500);
    });
    render(<InvitationsPage />);
    await user.click(await screen.findByRole("button", { name: /No thanks/i }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/apartments"));
  });

  it("with no invitations, explains and offers to start a household or sign out", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonRes({ invitations: [] }));
    render(<InvitationsPage />);
    expect(await screen.findByText(/no pending invitations/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Sign out/i }));
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/" });
  });

  it("polls every 15 s", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(jsonRes({ invitations: [] }));
    render(<InvitationsPage />);
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
