import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { timingSafeEqual } from "node:crypto";
import pdfParse from "pdf-parse";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "dist");
const app = express();

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

app.use(express.json({ limit: "25mb" }));
app.use(express.static(distPath));

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
    return res.status(500).json({ error: "FIREWORKS_API_KEY or FIREWORKS_MODEL missing" });
  }

  const fileBase64 = req.body?.fileBase64;
  const fileName = String(req.body?.fileName ?? "listing.pdf");
  if (!fileBase64) {
    return res.status(400).json({ error: "fileBase64 is required" });
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
      return res.status(502).json({ error: "Fireworks request failed", details });
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ error: "Fireworks returned empty content" });
    }

    const normalized = normalizeParsedApartment(JSON.parse(content));
    return res.status(200).json(normalized);
  } catch {
    return res
      .status(500)
      .json({ error: "Failed to parse PDF. Fill form manually and retry." });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`flatpare listening on http://0.0.0.0:${port}`);
});
