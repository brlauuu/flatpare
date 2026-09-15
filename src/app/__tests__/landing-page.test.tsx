import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextRequest } from "next/server";

// `src/app/page.tsx` is the one file in the app shell with real logic: it
// decides which sign-in buttons render, from env vars read on the SERVER so
// that GOOGLE_CLIENT_ID / GITHUB_CLIENT_ID never reach client-shipped code.
//
// Both `enabledProviderIds` (what the page renders) and `providers` (what
// Auth.js registers) are computed at module load from the same env, and
// src/auth.ts says in a comment that they "can never drift apart". Nothing
// enforced that. The drift test below does.

const OAUTH_VARS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
] as const;

beforeEach(() => {
  cleanup();
  vi.resetModules();
  for (const v of OAUTH_VARS) delete process.env[v];
  process.env.APP_PASSWORD = "secret123";
  process.env.AUTH_SECRET = "test-secret-not-for-real-use-000000000000";
  process.env.AUTH_TRUST_HOST = "true";
});

afterEach(() => {
  for (const v of OAUTH_VARS) delete process.env[v];
  delete process.env.APP_PASSWORD;
  delete process.env.AUTH_SECRET;
  delete process.env.AUTH_TRUST_HOST;
});

/** Renders the server component and reports which provider ids it passed down. */
async function renderedProviderIds(): Promise<string[]> {
  vi.doMock("../login-form", () => ({
    LoginForm: ({ providers }: { providers: string[] }) => (
      <div data-testid="login-form" data-providers={providers.join(",")} />
    ),
  }));
  const { default: LandingPage } = await import("../page");
  render(LandingPage());
  const el = screen.getByTestId("login-form");
  const raw = el.dataset.providers ?? "";
  return raw ? raw.split(",") : [];
}

/** What Auth.js actually registered, from its own providers endpoint. */
async function registeredProviderIds(): Promise<string[]> {
  const { handlers } = await import("@/auth");
  const res = await handlers.GET(
    new NextRequest("http://localhost/api/auth/providers")
  );
  return Object.keys((await res.json()) as Record<string, unknown>);
}

const CASES = [
  ["no OAuth vars — self-host default", {}, ["credentials"]],
  ["google only", { GOOGLE_CLIENT_ID: "g", GOOGLE_CLIENT_SECRET: "gs" }, ["google"]],
  ["github only", { GITHUB_CLIENT_ID: "h", GITHUB_CLIENT_SECRET: "hs" }, ["github"]],
  [
    "both",
    {
      GOOGLE_CLIENT_ID: "g",
      GOOGLE_CLIENT_SECRET: "gs",
      GITHUB_CLIENT_ID: "h",
      GITHUB_CLIENT_SECRET: "hs",
    },
    ["google", "github"],
  ],
] as const;

describe("LandingPage provider selection", () => {
  it.each(CASES)("%s", async (_label, env, expected) => {
    Object.assign(process.env, env);
    expect(await renderedProviderIds()).toEqual([...expected]);
  });

  it("renders the landing copy around the sign-in form", async () => {
    const ids = await renderedProviderIds();
    expect(ids).toEqual(["credentials"]);
    // The form is a slot inside the marketing page, not a separate route.
    expect(screen.getByTestId("login-form")).toBeInTheDocument();
  });

  // The invariant src/auth.ts promises in a comment and nothing enforced.
  // These two lists are computed separately from the same env; if one grows a
  // condition the other lacks, the page renders a button for a provider that
  // is not registered (or hides one that is).
  describe("never drifts from what Auth.js registers", () => {
    it.each(CASES)("%s", async (_label, env) => {
      Object.assign(process.env, env);
      const rendered = await renderedProviderIds();
      const registered = await registeredProviderIds();
      expect([...rendered].sort()).toEqual([...registered].sort());
    });
  });

  // AGENTS.md and docs/security-notes.md both document this as a deployment
  // footgun left as documentation rather than fixed in code. Pinning the
  // behaviour means the next person to read the code sees what actually
  // happens, and a silent change to it fails here.
  describe("the documented CLIENT_ID-without-CLIENT_SECRET footgun", () => {
    it("still suppresses the password fallback, locking everyone out", async () => {
      process.env.GOOGLE_CLIENT_ID = "g"; // no GOOGLE_CLIENT_SECRET

      const rendered = await renderedProviderIds();
      // Registration keys on CLIENT_ID alone, so google appears and
      // credentials is dropped — leaving no usable way in.
      expect(rendered).toEqual(["google"]);
      expect(rendered).not.toContain("credentials");
      // Still no drift: the page and Auth.js agree, both wrongly.
      expect([...rendered].sort()).toEqual([...(await registeredProviderIds())].sort());
    });
  });

  it("never leaks the client id or secret into what the page renders", async () => {
    // Distinctive sentinels: a short value like "g" occurs naturally in any
    // HTML and would make this assertion pass or fail by accident.
    process.env.GOOGLE_CLIENT_ID = "CLIENT-ID-MUST-NOT-LEAK";
    process.env.GOOGLE_CLIENT_SECRET = "CLIENT-SECRET-MUST-NOT-LEAK";
    const rendered = await renderedProviderIds();

    // Only the provider's *id* travels to the client, never the credentials —
    // the whole reason this decision lives in a server component.
    expect(rendered).toEqual(["google"]);
    expect(document.body.innerHTML).not.toContain("CLIENT-ID-MUST-NOT-LEAK");
    expect(document.body.innerHTML).not.toContain("CLIENT-SECRET-MUST-NOT-LEAK");
  });
});
