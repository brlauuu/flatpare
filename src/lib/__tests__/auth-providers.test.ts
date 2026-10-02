import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// auth.ts reads process.env once at module load (to decide which providers
// to register), so every case needs a fresh module instance via
// vi.resetModules() + a dynamic import *after* the env is set — a static
// top-level import would only ever exercise whichever env was live first.
const OAUTH_VARS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  // The magic-link provider (#310) is keyed on these two.
  "RESEND_API_KEY",
  "RESEND_EMAIL_DOMAIN",
  "EMAIL_FROM",
] as const;

beforeEach(() => {
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

async function registeredProviderIds(): Promise<string[]> {
  const { handlers } = await import("@/auth");
  const res = await handlers.GET(
    new NextRequest("http://localhost/api/auth/providers")
  );
  const body = (await res.json()) as Record<string, unknown>;
  return Object.keys(body);
}

// The `/api/auth/providers` JSON response deliberately never exposes
// clientId/clientSecret (Auth.js strips them), so "a provider with this id
// is registered" — what registeredProviderIds() proves — is not the same
// claim as "that provider actually has our credentials." A provider
// constructed with no clientId still shows up in that list; only inspecting
// the constructed provider object catches a missing/misrouted credential.
async function providerOptions(
  id: "google" | "github"
): Promise<{ clientId?: string; clientSecret?: string } | undefined> {
  const { providers } = await import("@/auth");
  // Auth.js's public Provider type doesn't expose `options` (it's an
  // internal detail of how the OAuth factory functions stash the config
  // object they were called with), so this reads the runtime shape
  // directly rather than fighting the public type.
  type RuntimeProvider = {
    id?: string;
    options?: { clientId?: string; clientSecret?: string };
  };
  const provider = (providers as unknown as RuntimeProvider[]).find(
    (p) => typeof p !== "function" && p?.id === id
  );
  return provider?.options;
}

describe("Auth.js provider registration", () => {
  it("registers only the credentials provider when no OAuth env vars are set", async () => {
    const ids = await registeredProviderIds();
    expect(ids).toContain("credentials");
    expect(ids).not.toContain("google");
    expect(ids).not.toContain("github");
  });

  it("registers google and drops the credentials backdoor when GOOGLE_CLIENT_ID is set", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
    const ids = await registeredProviderIds();
    expect(ids).toContain("google");
    expect(ids).not.toContain("credentials");
  });

  it("registers github and drops the credentials backdoor when GITHUB_CLIENT_ID is set", async () => {
    process.env.GITHUB_CLIENT_ID = "test-github-client-id";
    const ids = await registeredProviderIds();
    expect(ids).toContain("github");
    expect(ids).not.toContain("credentials");
  });

  it("registers both OAuth providers and drops the credentials backdoor when both are set", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
    process.env.GITHUB_CLIENT_ID = "test-github-client-id";
    const ids = await registeredProviderIds();
    expect(ids).toContain("google");
    expect(ids).toContain("github");
    expect(ids).not.toContain("credentials");
  });
});

describe("Auth.js provider registration — credentials actually carry the env values", () => {
  // Regression: @auth/core's setEnvDefaults() reads AUTH_GOOGLE_ID /
  // AUTH_GOOGLE_SECRET (and the GitHub equivalents) for a *bare* provider
  // function — a different pair of names than GOOGLE_CLIENT_ID, the var
  // that gates registration in src/auth.ts. A bare `Google` (no explicit
  // config) would register successfully — passing every test above — while
  // silently carrying no clientId at all, because nothing in this repo ever
  // sets AUTH_GOOGLE_ID. These tests fail on that bare form and only pass
  // when the clientId is threaded through explicitly from the same var that
  // gates registration.
  it("wires GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET into the constructed google provider", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
    const options = await providerOptions("google");
    expect(options?.clientId).toBe("test-google-client-id");
    expect(options?.clientSecret).toBe("test-google-client-secret");
  });

  it("wires GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET into the constructed github provider", async () => {
    process.env.GITHUB_CLIENT_ID = "test-github-client-id";
    process.env.GITHUB_CLIENT_SECRET = "test-github-client-secret";
    const options = await providerOptions("github");
    expect(options?.clientId).toBe("test-github-client-id");
    expect(options?.clientSecret).toBe("test-github-client-secret");
  });
});

// Magic links (#310): registered exactly when email is on, and the shared
// password disappears then for the same reason it does under OAuth.
describe("magic-link provider registration", () => {
  const emailOn = () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "Flatpare <hello@flatpare.com>";
  };

  it("registers resend and drops the credentials backdoor when email is on", async () => {
    emailOn();
    const ids = await registeredProviderIds();
    expect(ids).toContain("resend");
    expect(ids).not.toContain("credentials");
  });

  it("does not register resend with a key but no sender", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const ids = await registeredProviderIds();
    expect(ids).not.toContain("resend");
    expect(ids).toContain("credentials");
  });

  it("sits beside OAuth when both are configured", async () => {
    emailOn();
    process.env.GOOGLE_CLIENT_ID = "g-id";
    process.env.GOOGLE_CLIENT_SECRET = "g-secret";
    const ids = await registeredProviderIds();
    expect(ids).toEqual(expect.arrayContaining(["google", "resend"]));
    expect(ids).not.toContain("credentials");
  });

  it("enabledProviderIds matches the registered set", async () => {
    emailOn();
    const { enabledProviderIds } = await import("@/auth");
    expect(enabledProviderIds).toEqual(["resend"]);
  });

  it("links expire in 15 minutes and come from our sender", async () => {
    emailOn();
    // Auth.js keeps the user config under `options` and merges it over the
    // provider's defaults at request time, so the defaults (a day, the
    // authjs.dev sender) are what the bare object shows. Read what we set.
    const { providers, MAGIC_LINK_MAX_AGE_SECONDS } = await import("@/auth");
    type Runtime = { id?: string; options?: { maxAge?: number; from?: string } };
    const resend = (providers as unknown as Runtime[]).find((p) => p?.id === "resend");
    expect(MAGIC_LINK_MAX_AGE_SECONDS).toBe(900);
    expect(resend?.options?.maxAge).toBe(900);
    expect(resend?.options?.from).toBe("Flatpare <hello@flatpare.com>");
  });

  describe("sendVerificationRequest", () => {
    const fetchMock = vi.fn();
    beforeEach(() => {
      emailOn();
      fetchMock.mockReset();
      vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => vi.unstubAllGlobals());

    type Sender = {
      id?: string;
      options: { sendVerificationRequest: Sender["sendVerificationRequest"] };
      sendVerificationRequest: (p: {
        identifier: string;
        url: string;
        token: string;
        expires: Date;
        provider: unknown;
        request: Request;
        theme: unknown;
      }) => Promise<void>;
    };
    async function sender(): Promise<Sender> {
      const { providers } = await import("@/auth");
      // Ours lives under `options` (see above); the top-level one is the
      // provider's default that Auth.js replaces with it.
      const p = (providers as unknown as Sender[]).find((p) => p?.id === "resend")!;
      return { ...p, sendVerificationRequest: p.options.sendVerificationRequest };
    }
    const params = (url: string) => ({
      identifier: "ana@example.com",
      url,
      token: "tok",
      expires: new Date(),
      provider: {},
      request: new Request("http://localhost"),
      theme: {},
    });

    it("sends the link to the address through our sender, keyed on the token", async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "e" }), { status: 200 }));
      const url = "https://flatpare.com/api/auth/callback/resend?callbackUrl=%2Fapartments&token=abc123&email=ana%40example.com";
      await (await sender()).sendVerificationRequest(params(url));

      const [endpoint, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(endpoint).toBe("https://api.resend.com/emails");
      expect((init.headers as Record<string, string>)["idempotency-key"]).toBe("magic-link/abc123");
      const body = JSON.parse(String(init.body));
      expect(body.to).toEqual(["ana@example.com"]);
      expect(body.from).toBe("Flatpare <hello@flatpare.com>");
      expect(body.subject).toBe("Your Flatpare sign-in link");
      expect(body.text).toContain(url);
      expect(body.html).toContain("flatpare.com");
      expect(body.text).toMatch(/15 minutes/);
    });

    it("throws on a failed send, without the address in the message", async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "nope ana@example.com" }), { status: 422 }));
      await expect(
        (await sender()).sendVerificationRequest(params("https://flatpare.com/api/auth/callback/resend?token=t"))
      ).rejects.toThrow(/could not send/i);
      await expect(
        (await sender()).sendVerificationRequest(params("https://flatpare.com/api/auth/callback/resend?token=t"))
      ).rejects.not.toThrow(/ana@example.com/);
    });
  });
});
