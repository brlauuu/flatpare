import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

// Which AI backend reads listing PDFs and writes their summary (#333).
//
// - "google" (the default): direct to the Gemini API with
//   GOOGLE_GENERATIVE_AI_API_KEY — what a self-hoster already has, no extra
//   account. Google's Gemini API terms apply: on its unpaid tier Google may
//   use what is sent to improve its products and humans may read it; on the
//   paid tier it does not, but logs requests for a limited period for abuse
//   monitoring. There is no zero-retention setting on this path.
// - "gateway": through Vercel AI Gateway, authenticated by OIDC on Vercel or
//   AI_GATEWAY_API_KEY elsewhere. Every request demands zero data retention
//   unless the operator opts out: the gateway then routes only to providers
//   with a ZDR agreement and FAILS rather than falling back. Request-level ZDR
//   needs a Vercel Pro or Enterprise plan, which is why the opt-out exists.
//
// The hosted deployment runs "gateway"; the landing page's privacy section
// states zero data retention for it, so the boot line (instrumentation.ts)
// says which mode is live.

export type AiProvider = "google" | "gateway";

export interface AiConfig {
  provider: AiProvider;
  modelId: string;
  // Meaningful on the gateway path only; always false on "google".
  zeroDataRetention: boolean;
}

export const DEFAULT_GOOGLE_MODEL = "gemini-2.5-flash";
export const DEFAULT_GATEWAY_MODEL = "google/gemini-2.5-flash";

export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigError";
  }
}

type Env = Record<string, string | undefined>;

// Empty counts as unset: docker-compose passes `VAR=${VAR:-}`.
function read(env: Env, name: string): string | undefined {
  const value = env[name];
  return value === undefined || value === "" ? undefined : value;
}

// Values are matched exactly, like FLATPARE_ENCRYPTION: a typo must not
// silently pick a backend with different data terms.
export function readAiConfig(env: Env = process.env): AiConfig {
  const provider = read(env, "AI_PROVIDER") ?? "google";
  if (provider !== "google" && provider !== "gateway") {
    throw new AiConfigError(
      `AI_PROVIDER must be "google" or "gateway" (got ${JSON.stringify(provider)}). ` +
        "Leave it unset to use Google directly."
    );
  }
  const zdr = read(env, "AI_ZERO_DATA_RETENTION");
  const model = read(env, "AI_MODEL");

  if (provider === "google") {
    if (zdr !== undefined) {
      throw new AiConfigError(
        "AI_ZERO_DATA_RETENTION only applies to AI_PROVIDER=gateway. The Gemini API has no " +
          "zero-retention setting; use AI_PROVIDER=gateway for zero data retention, or unset it."
      );
    }
    return { provider, modelId: model ?? DEFAULT_GOOGLE_MODEL, zeroDataRetention: false };
  }

  if (zdr !== undefined && zdr !== "true" && zdr !== "false") {
    throw new AiConfigError(
      `AI_ZERO_DATA_RETENTION must be "true" or "false" (got ${JSON.stringify(zdr)}). ` +
        "Leave it unset to require zero data retention."
    );
  }
  return {
    provider,
    modelId: model ?? DEFAULT_GATEWAY_MODEL,
    zeroDataRetention: zdr !== "false",
  };
}

// Whether PDF extraction can run at all; without it the upload flow falls
// back to manual entry. On the gateway path the operator chose it explicitly
// and OIDC is not reliably visible as an env var, so it is taken at its word.
export function aiAvailable(config: AiConfig, env: Env = process.env): boolean {
  if (config.provider === "gateway") return true;
  return read(env, "GOOGLE_GENERATIVE_AI_API_KEY") !== undefined;
}

// A plain "provider/model" string routes through AI Gateway in the AI SDK.
export function aiModel(config: AiConfig): LanguageModel {
  return config.provider === "gateway" ? config.modelId : google(config.modelId);
}

export function aiProviderOptions(
  config: AiConfig
): { gateway: { zeroDataRetention: true } } | undefined {
  if (config.provider === "gateway" && config.zeroDataRetention) {
    return { gateway: { zeroDataRetention: true } };
  }
  return undefined;
}

// One line for the boot log. Never includes a key.
export function describeAi(config: AiConfig, env: Env = process.env): string {
  if (config.provider === "gateway") {
    return `gateway — ${config.modelId}, zero data retention ${config.zeroDataRetention ? "on" : "OFF"}`;
  }
  if (!aiAvailable(config, env)) return "none — PDF extraction falls back to manual entry";
  return `google — ${config.modelId}, direct (Google's Gemini API terms apply)`;
}
