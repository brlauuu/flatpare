import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Every signed-in section shares ONE layout, src/app/(app)/layout.tsx (#302),
// and what it composes is a contract rather than a coincidence:
//
//   resolveHouseholdIdentity -> requirePurchase -> CryptoGate ->
//   HouseholdDataProvider -> children
//
// The nesting is load-bearing. HouseholdDataProvider must sit INSIDE
// CryptoGate so `dataKey` exists when the store decodes, and it is mounted in
// the layouts rather than inside crypto-gate.tsx specifically to break a
// src/components/crypto <-> src/components/household-data import cycle (E3).
// A well-meaning refactor that hoists the provider out, or drops the gate, is
// what this file exists to fail on.
//
// It was four layouts, one per section, until #302. The second half of this
// file pins why it must not become four again: a section that brings its own
// async layout makes every switch into it wait on the server and remount the
// providers.

const authMock = vi.fn();
vi.mock("@/auth", () => ({ auth: () => authMock() }));

const resolveHouseholdIdentity = vi.fn();
vi.mock("@/lib/session", () => ({
  resolveHouseholdIdentity: () => resolveHouseholdIdentity(),
}));

const readLimits = vi.fn();
vi.mock("@/lib/limits", () => ({ readLimits: () => readLimits() }));

const requirePurchase = vi.fn();
vi.mock("@/lib/billing-gate", () => ({
  requirePurchase: (id: number) => requirePurchase(id),
}));

vi.mock("@/components/nav-bar", () => ({
  NavBar: ({ userName }: { userName: string }) => <div data-testid="nav">{userName}</div>,
}));
vi.mock("@/components/crypto/crypto-gate", () => ({
  CryptoGate: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="crypto-gate">{children}</div>
  ),
}));
vi.mock("@/components/household-data/household-data-provider", () => ({
  HouseholdDataProvider: ({
    children,
    identity,
    limits,
  }: {
    children: React.ReactNode;
    identity: unknown;
    limits: unknown;
  }) => (
    <div
      data-testid="household-provider"
      data-identity={JSON.stringify(identity)}
      data-limits={JSON.stringify(limits)}
    >
      {children}
    </div>
  ),
}));

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import AppLayout from "../(app)/layout";

const LAYOUTS = [["shared", AppLayout]] as const;

const IDENTITY = { householdId: 7, userId: "o", role: "owner" as const };

async function renderLayout(
  Layout: (props: { children: React.ReactNode }) => Promise<React.ReactElement>
) {
  const tree = await Layout({ children: <div data-testid="child" /> });
  render(tree);
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { name: "Ana" } });
  resolveHouseholdIdentity.mockResolvedValue(IDENTITY);
  readLimits.mockReturnValue({ maxMembers: null, maxApartments: null });
  requirePurchase.mockResolvedValue(undefined);
});

describe.each(LAYOUTS)("%s layout", (name, Layout) => {
  it("runs the purchase gate for the resolved household", async () => {
    await renderLayout(Layout);
    expect(requirePurchase).toHaveBeenCalledWith(IDENTITY.householdId);
  });

  it("mounts the household store INSIDE the crypto gate", async () => {
    await renderLayout(Layout);
    const gate = screen.getByTestId("crypto-gate");
    const provider = screen.getByTestId("household-provider");
    // Nesting, not mere presence: the store needs dataKey, which only exists
    // below the gate.
    expect(gate).toContainElement(provider);
    expect(provider).toContainElement(screen.getByTestId("child"));
  });

  it("passes identity and limits down as props", async () => {
    readLimits.mockReturnValue({ maxMembers: 10, maxApartments: 40 });
    await renderLayout(Layout);
    const provider = screen.getByTestId("household-provider");
    // Server-read and passed as props — MAX_* must never be read in a
    // "use client" file.
    expect(JSON.parse(provider.dataset.limits!)).toEqual({
      maxMembers: 10,
      maxApartments: 40,
    });
    expect(JSON.parse(provider.dataset.identity!)).toEqual(IDENTITY);
  });

  it("renders the nav with the session's name", async () => {
    await renderLayout(Layout);
    expect(screen.getByTestId("nav")).toHaveTextContent("Ana");
  });

  it("falls back to 'Unknown' for a nameless session", async () => {
    authMock.mockResolvedValue({ user: {} });
    await renderLayout(Layout);
    expect(screen.getByTestId("nav")).toHaveTextContent("Unknown");
  });

  it("renders no providers and no children without a household", async () => {
    // A signed-in user with no household is bound for /invitations via the
    // proxy; the layout must not mount a store it has no identity for.
    resolveHouseholdIdentity.mockResolvedValue(null);
    await renderLayout(Layout);

    expect(screen.queryByTestId("crypto-gate")).not.toBeInTheDocument();
    expect(screen.queryByTestId("household-provider")).not.toBeInTheDocument();
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
    // Still renders the shell, so the user is not staring at a blank page.
    expect(screen.getByTestId("nav")).toBeInTheDocument();
  });

  it("does not run the purchase gate without a household", async () => {
    resolveHouseholdIdentity.mockResolvedValue(null);
    await renderLayout(Layout);
    expect(requirePurchase).not.toHaveBeenCalled();
  });

  it("lets the purchase gate's redirect propagate", async () => {
    // requirePurchase redirects by throwing. Swallowing that would render the
    // app to a household that never paid.
    requirePurchase.mockRejectedValue(new Error("NEXT_REDIRECT:/billing"));
    await expect(renderLayout(Layout)).rejects.toThrow("NEXT_REDIRECT:/billing");
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
  });
});

describe("section layouts", () => {
  const root = join(process.cwd(), "src/app/(app)");
  const nested: string[] = [];
  (function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name === "layout.tsx" && dir !== root) nested.push(path);
    }
  })(root);

  it("finds the sections", () => {
    for (const section of ["apartments", "compare", "household", "settings", "guide"]) {
      expect(existsSync(join(root, section, "page.tsx")), section).toBe(true);
    }
    expect(nested.length).toBeGreaterThan(0);
  });

  it.each(nested.map((p) => [p.slice(root.length + 1), p]))(
    "%s awaits nothing and mounts no provider",
    (_name, path) => {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/\basync\b/);
      expect(source).not.toMatch(/\bawait\b/);
      expect(source).not.toMatch(/CryptoGate|HouseholdDataProvider|NavBar|@\/auth/);
    }
  );

  it("has a loading state beside the shared layout", () => {
    expect(existsSync(join(root, "loading.tsx"))).toBe(true);
  });
});
