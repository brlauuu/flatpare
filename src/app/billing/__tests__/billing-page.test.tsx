import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Server components, so these are called as functions and their returned tree
// is rendered. The dependencies are the boundary worth mocking: auth, the
// identity resolution and the balance read.
const authMock = vi.fn();
vi.mock("@/auth", () => ({ auth: () => authMock() }));

const resolveHouseholdIdentity = vi.fn();
vi.mock("@/lib/session", () => ({
  resolveHouseholdIdentity: () => resolveHouseholdIdentity(),
}));

const readCreditBalance = vi.fn();
vi.mock("@/lib/billing", () => ({
  readCreditBalance: (id: number) => readCreditBalance(id),
}));

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

// Not under test here; it has its own file.
vi.mock("../checkout-panel", () => ({
  CheckoutPanel: () => <div data-testid="checkout-panel" />,
}));
vi.mock("@/components/nav-bar", () => ({
  NavBar: ({ userName }: { userName: string }) => <div data-testid="nav">{userName}</div>,
}));

import BillingPage from "../page";

function balance(over: Partial<{ granted: number; used: number; remaining: number; enabled: boolean }> = {}) {
  return { granted: 0, used: 0, remaining: 0, enabled: true, ...over };
}

/** Renders the server component, or reports the redirect it threw instead. */
async function renderPage(): Promise<"redirected" | "rendered"> {
  try {
    const tree = await BillingPage();
    render(tree);
    return "rendered";
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("NEXT_REDIRECT:")) {
      return "redirected";
    }
    throw err;
  }
}

beforeEach(() => {
  cleanup();
  redirect.mockClear();
  redirect.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
  authMock.mockResolvedValue({ user: { name: "Ana" } });
  resolveHouseholdIdentity.mockResolvedValue({ householdId: 1, userId: "o", role: "owner" });
  readCreditBalance.mockResolvedValue(balance());
});

describe("BillingPage", () => {
  it("sells the first purchase to a household that has never bought", async () => {
    expect(await renderPage()).toBe("rendered");
    expect(
      screen.getByRole("heading", { name: /one payment, then it's yours/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId("checkout-panel")).toBeInTheDocument();
  });

  it("states the price and the 10/40 entitlement the landing page sells", async () => {
    await renderPage();
    // A billing page that contradicts the pricing copy is worse than one that
    // says nothing; these numbers move together or not at all.
    expect(screen.getByText(/CHF 5, once/i)).toBeInTheDocument();
    expect(screen.getByText(/10 people and 40 apartments/i)).toBeInTheDocument();
  });

  it("explains that the quota counts apartments added, not held", async () => {
    await renderPage();
    // The distinction a support complaint is made of.
    expect(screen.getByText(/deleting one frees room/i)).toBeInTheDocument();
  });

  it("offers a top-up to a household that has bought before", async () => {
    readCreditBalance.mockResolvedValue(balance({ granted: 40, used: 40, remaining: 0 }));
    expect(await renderPage()).toBe("rendered");
    expect(
      screen.getByRole("heading", { name: /add 40 more apartments/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/used 40 of 40 apartments/i)).toBeInTheDocument();
  });

  it("redirects to /apartments when billing is off", async () => {
    // Self-hosted: there is nothing to sell, so this page has no purpose.
    readCreditBalance.mockResolvedValue(balance({ enabled: false }));
    expect(await renderPage()).toBe("redirected");
    expect(redirect).toHaveBeenCalledWith("/apartments");
  });

  it("redirects to / when there is no household", async () => {
    resolveHouseholdIdentity.mockResolvedValue(null);
    expect(await renderPage()).toBe("redirected");
    expect(redirect).toHaveBeenCalledWith("/");
    expect(readCreditBalance).not.toHaveBeenCalled();
  });

  it("falls back to 'Unknown' rather than crashing on a nameless session", async () => {
    authMock.mockResolvedValue({ user: {} });
    expect(await renderPage()).toBe("rendered");
    expect(screen.getByTestId("nav")).toHaveTextContent("Unknown");
  });
});
