import type { VercelRequest, VercelResponse } from "@vercel/node";

const MODEL_STATUS_TTL_MS = 5 * 60 * 1000;

type ModelStatus = {
  ok: boolean;
  configured: boolean;
  model: string;
  checkedAt: string | null;
  stage: string;
  message: string;
  details: string;
};

let modelStatus: ModelStatus = {
  ok: false,
  configured: false,
  model: process.env.FIREWORKS_MODEL ?? "",
  checkedAt: null,
  stage: "init",
  message: "Model validation has not run yet.",
  details: ""
};

async function validateConfiguredModel(): Promise<ModelStatus> {
  const apiKey = process.env.FIREWORKS_API_KEY;
  const model = process.env.FIREWORKS_MODEL;
  const checkedAt = new Date().toISOString();

  if (!apiKey || !model) {
    modelStatus = {
      ok: false,
      configured: false,
      model: model ?? "",
      checkedAt,
      stage: "config",
      message: "FIREWORKS_API_KEY or FIREWORKS_MODEL is missing.",
      details: "Set both FIREWORKS_API_KEY and FIREWORKS_MODEL."
    };
    return modelStatus;
  }

  try {
    const response = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }]
      })
    });

    if (!response.ok) {
      const details = await response.text();
      modelStatus = {
        ok: false,
        configured: true,
        model,
        checkedAt,
        stage: "upstream",
        message: "Model is configured but not reachable for chat completions.",
        details
      };
      return modelStatus;
    }

    modelStatus = {
      ok: true,
      configured: true,
      model,
      checkedAt,
      stage: "ok",
      message: "Model validation succeeded.",
      details: ""
    };
    return modelStatus;
  } catch (error) {
    modelStatus = {
      ok: false,
      configured: true,
      model,
      checkedAt,
      stage: "server",
      message: "Validation failed due to server/network error.",
      details: error instanceof Error ? error.message : "Unknown server error"
    };
    return modelStatus;
  }
}

async function ensureFreshModelStatus(): Promise<ModelStatus> {
  const now = Date.now();
  const checkedAtMs = modelStatus.checkedAt ? Date.parse(modelStatus.checkedAt) : 0;
  const stale =
    !checkedAtMs || Number.isNaN(checkedAtMs) || now - checkedAtMs > MODEL_STATUS_TTL_MS;

  if (stale) {
    await validateConfiguredModel();
  }

  return modelStatus;
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const status = await ensureFreshModelStatus();
  return res.status(status.ok ? 200 : 503).json(status);
}
