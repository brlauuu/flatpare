import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { timingSafeEqual } from "node:crypto";
import pdfParse from "pdf-parse";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "dist");
const app = express();
const args = process.argv.slice(2);
const isApiOnly = args.includes("--api-only");
const portArg = args.find((arg) => arg.startsWith("--port="));
const portFromArg = portArg ? Number(portArg.split("=")[1]) : Number.NaN;
const MODEL_STATUS_TTL_MS = 5 * 60 * 1000;

let modelStatus = {
  ok: false,
  configured: false,
  model: process.env.FIREWORKS_MODEL ?? "",
  checkedAt: null,
  stage: "init",
  message: "Model validation has not run yet.",
  details: ""
};

const parsePrompt = `
Extract apartment listing data from the provided PDF text.
Return strictly valid JSON with these keys:
name, addr, url, rent, rooms, baths, bal, dist, wash, info.
Rules:
- If a field is missing, use "?".
- wash must be one of: "yes", "no", "?".
- rent, rooms, baths may be numeric values when available.
- Keep addr as full street address with postcode if available.
- dist should be "?" unless clearly present.
- Return only JSON. No markdown.
`;

function extractJsonObject(text) {
  const start = text.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

function parseModelJson(content) {
  try {
    return { parsed: JSON.parse(content), recovered: false };
  } catch {
    const extracted = extractJsonObject(content);
    if (!extracted) {
      throw new Error("Model response did not contain a valid JSON object.");
    }

    return { parsed: JSON.parse(extracted), recovered: true };
  }
}

function safeEquals(input, expected) {
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);

  if (inputBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(inputBuffer, expectedBuffer);
}

function normalizeParsedApartment(parsed) {
  const warnings = [];
  const apartment = {
    name: parsed.name?.trim() || "",
    addr: parsed.addr?.trim() || "",
    url: parsed.url?.trim() || "",
    rent: parsed.rent ?? "?",
    rooms: parsed.rooms ?? "?",
    baths: parsed.baths ?? "?",
    bal: parsed.bal ?? "?",
    dist: parsed.dist?.trim() || "?",
    wash: parsed.wash ?? "?",
    info: parsed.info?.trim() || ""
  };

  if (!["yes", "no", "?"].includes(apartment.wash)) {
    apartment.wash = "?";
    warnings.push("Wash value was unknown and normalized to '?'.");
  }

  if (!apartment.addr) {
    warnings.push("Address could not be extracted. Please fill it manually.");
  }

  return { apartment, warnings };
}

async function validateConfiguredModel() {
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

async function ensureFreshModelStatus() {
  const now = Date.now();
  const checkedAtMs = modelStatus.checkedAt ? Date.parse(modelStatus.checkedAt) : 0;
  const stale = !checkedAtMs || Number.isNaN(checkedAtMs) || now - checkedAtMs > MODEL_STATUS_TTL_MS;
  if (stale) {
    await validateConfiguredModel();
  }
  return modelStatus;
}

app.use(express.json({ limit: "25mb" }));
if (!isApiOnly) {
  app.use(express.static(distPath));
}

app.get("/api/model-status", async (_req, res) => {
  const status = await ensureFreshModelStatus();
  return res.status(status.ok ? 200 : 503).json(status);
});

app.post("/api/verify-password", (req, res) => {
  const configuredPassword = process.env.APP_PASSWORD;
  if (!configuredPassword) {
    return res.status(500).json({ ok: false, error: "APP_PASSWORD missing" });
  }

  const password = String(req.body?.password ?? "");
  if (!safeEquals(password, configuredPassword)) {
    return res.status(401).json({ ok: false });
  }

  return res.status(200).json({ ok: true });
});

app.post("/api/parse-pdf", async (req, res) => {
  const apiKey = process.env.FIREWORKS_API_KEY;
  const model = process.env.FIREWORKS_MODEL;

  if (!apiKey || !model) {
    return res.status(500).json({
      error: "FIREWORKS_API_KEY or FIREWORKS_MODEL missing",
      stage: "config",
      details: "Set FIREWORKS_API_KEY and FIREWORKS_MODEL in environment."
    });
  }

  const fileBase64 = req.body?.fileBase64;
  const fileName = String(req.body?.fileName ?? "listing.pdf");
  if (!fileBase64) {
    return res.status(400).json({
      error: "fileBase64 is required",
      stage: "validation",
      details: "Frontend request body did not include fileBase64."
    });
  }

  try {
    const pdfBuffer = Buffer.from(fileBase64, "base64");
    const pdfText = (await pdfParse(pdfBuffer)).text;

    const response = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: parsePrompt },
          { role: "user", content: `File: ${fileName}\n\nPDF text:\n${pdfText}` }
        ]
      })
    });

    if (!response.ok) {
      const details = await response.text();
      return res.status(502).json({
        error: "Fireworks request failed",
        stage: "upstream",
        details
      });
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({
        error: "Fireworks returned empty content",
        stage: "upstream",
        details: "No `choices[0].message.content` in Fireworks response."
      });
    }

    const { parsed, recovered } = parseModelJson(content);
    const normalized = normalizeParsedApartment(parsed);
    if (recovered) {
      normalized.warnings.push(
        "Recovered JSON from extra model output. Consider using a more JSON-strict model."
      );
    }
    return res.status(200).json(normalized);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to parse PDF. Fill form manually and retry.",
      stage: "server",
      details: error instanceof Error ? error.message : "Unknown server error"
    });
  }
});

if (!isApiOnly) {
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

const port = Number.isFinite(portFromArg) ? portFromArg : Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  const mode = isApiOnly ? "API-only" : "full";
  console.log(`flatpare (${mode}) listening on http://0.0.0.0:${port}`);
  void validateConfiguredModel();
});
