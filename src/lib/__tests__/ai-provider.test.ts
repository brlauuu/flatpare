import { describe, it, expect } from "vitest";
import {
  readAiConfig,
  aiAvailable,
  aiProviderOptions,
  describeAi,
  AiConfigError,
  DEFAULT_GOOGLE_MODEL,
  DEFAULT_GATEWAY_MODEL,
} from "../ai-provider";

// #333: one place decides which AI backend reads PDFs. Google is the
// self-hoster default (no extra account); the hosted deployment opts in to
// Vercel AI Gateway, where every request demands zero data retention.
describe("readAiConfig", () => {
  it("defaults to Google with the default model", () => {
    expect(readAiConfig({})).toEqual({
      provider: "google",
      modelId: DEFAULT_GOOGLE_MODEL,
      zeroDataRetention: false,
    });
  });

  // docker-compose passes `VAR=${VAR:-}`, so unset arrives as "".
  it("treats empty values as unset", () => {
    expect(readAiConfig({ AI_PROVIDER: "", AI_MODEL: "", AI_ZERO_DATA_RETENTION: "" })).toEqual(
      readAiConfig({})
    );
  });

  it("uses the gateway with zero data retention on by default", () => {
    expect(readAiConfig({ AI_PROVIDER: "gateway" })).toEqual({
      provider: "gateway",
      modelId: DEFAULT_GATEWAY_MODEL,
      zeroDataRetention: true,
    });
  });

  it("lets a gateway deployment opt out of zero data retention explicitly", () => {
    expect(
      readAiConfig({ AI_PROVIDER: "gateway", AI_ZERO_DATA_RETENTION: "false" }).zeroDataRetention
    ).toBe(false);
    expect(
      readAiConfig({ AI_PROVIDER: "gateway", AI_ZERO_DATA_RETENTION: "true" }).zeroDataRetention
    ).toBe(true);
  });

  it("takes a model override on either provider", () => {
    expect(readAiConfig({ AI_MODEL: "gemini-2.5-pro" }).modelId).toBe("gemini-2.5-pro");
    expect(readAiConfig({ AI_PROVIDER: "gateway", AI_MODEL: "anthropic/claude-haiku-4.5" }).modelId).toBe(
      "anthropic/claude-haiku-4.5"
    );
  });

  // Matched exactly, like FLATPARE_ENCRYPTION: a typo must not silently pick
  // a provider with different data terms.
  it("rejects an unknown provider", () => {
    expect(() => readAiConfig({ AI_PROVIDER: "Gateway" })).toThrow(AiConfigError);
    expect(() => readAiConfig({ AI_PROVIDER: "openai" })).toThrow(/AI_PROVIDER/);
  });

  it("rejects a zero-data-retention value that is not true or false", () => {
    expect(() => readAiConfig({ AI_PROVIDER: "gateway", AI_ZERO_DATA_RETENTION: "yes" })).toThrow(
      /AI_ZERO_DATA_RETENTION/
    );
  });

  // Google's Gemini API has no zero-retention setting; asking for one on that
  // path must fail loudly rather than be ignored.
  it("rejects AI_ZERO_DATA_RETENTION on the Google path", () => {
    expect(() => readAiConfig({ AI_ZERO_DATA_RETENTION: "true" })).toThrow(/only applies to AI_PROVIDER=gateway/);
    expect(() => readAiConfig({ AI_ZERO_DATA_RETENTION: "false" })).toThrow(AiConfigError);
  });
});

describe("aiAvailable", () => {
  it("needs the Gemini key on the Google path", () => {
    expect(aiAvailable(readAiConfig({}), {})).toBe(false);
    expect(aiAvailable(readAiConfig({}), { GOOGLE_GENERATIVE_AI_API_KEY: "" })).toBe(false);
    expect(aiAvailable(readAiConfig({}), { GOOGLE_GENERATIVE_AI_API_KEY: "k" })).toBe(true);
  });

  // On Vercel the gateway authenticates with OIDC, which is not visible as a
  // plain env var in every runtime, so an operator who chose the gateway is
  // taken at their word; a failed call surfaces as an extraction error.
  it("is available on the gateway path once chosen", () => {
    expect(aiAvailable(readAiConfig({ AI_PROVIDER: "gateway" }), {})).toBe(true);
  });
});

describe("aiProviderOptions", () => {
  it("demands zero data retention on every gateway request", () => {
    expect(aiProviderOptions(readAiConfig({ AI_PROVIDER: "gateway" }))).toEqual({
      gateway: { zeroDataRetention: true },
    });
  });

  it("sends no gateway options when opted out, or on the Google path", () => {
    expect(
      aiProviderOptions(readAiConfig({ AI_PROVIDER: "gateway", AI_ZERO_DATA_RETENTION: "false" }))
    ).toBeUndefined();
    expect(aiProviderOptions(readAiConfig({}))).toBeUndefined();
  });
});

describe("describeAi", () => {
  it("says which backend and whether zero data retention is on", () => {
    expect(describeAi(readAiConfig({ AI_PROVIDER: "gateway" }), {})).toBe(
      `gateway — ${DEFAULT_GATEWAY_MODEL}, zero data retention on`
    );
    expect(
      describeAi(readAiConfig({ AI_PROVIDER: "gateway", AI_ZERO_DATA_RETENTION: "false" }), {})
    ).toBe(`gateway — ${DEFAULT_GATEWAY_MODEL}, zero data retention OFF`);
    expect(describeAi(readAiConfig({}), { GOOGLE_GENERATIVE_AI_API_KEY: "k" })).toBe(
      `google — ${DEFAULT_GOOGLE_MODEL}, direct (Google's Gemini API terms apply)`
    );
    expect(describeAi(readAiConfig({}), {})).toBe("none — PDF extraction falls back to manual entry");
  });

  it("never includes a key", () => {
    const line = describeAi(readAiConfig({}), { GOOGLE_GENERATIVE_AI_API_KEY: "secret-key-123" });
    expect(line).not.toContain("secret-key-123");
  });
});
