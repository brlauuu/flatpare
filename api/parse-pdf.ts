import type { VercelRequest, VercelResponse } from "@vercel/node";
import pdfParse from "pdf-parse";

type ParsePdfBody = {
  fileBase64?: string;
  fileName?: string;
};

type ParsedApartment = {
  name?: string;
  addr?: string;
  url?: string;
  rent?: number | string;
  rooms?: number | string;
  baths?: number | string;
  bal?: number | string;
  dist?: string;
  wash?: "yes" | "no" | "?";
  info?: string;
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

function normalize(parsed: ParsedApartment): { apartment: ParsedApartment; warnings: string[] } {
  const warnings: string[] = [];

  const apartment: ParsedApartment = {
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

  if (!["yes", "no", "?"].includes(apartment.wash ?? "?")) {
    apartment.wash = "?";
    warnings.push("Wash value was unknown and normalized to '?'.");
  }

  if (!apartment.addr) {
    warnings.push("Address could not be extracted. Please fill it manually.");
  }

  return { apartment, warnings };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.FIREWORKS_API_KEY;
  const model = process.env.FIREWORKS_MODEL;

  if (!apiKey || !model) {
    return res.status(500).json({
      error: "FIREWORKS_API_KEY or FIREWORKS_MODEL missing",
      stage: "config",
      details: "Set FIREWORKS_API_KEY and FIREWORKS_MODEL in environment."
    });
  }

  const body = (req.body ?? {}) as ParsePdfBody;
  if (!body.fileBase64) {
    return res.status(400).json({
      error: "fileBase64 is required",
      stage: "validation",
      details: "Frontend request body did not include fileBase64."
    });
  }

  try {
    const pdfBuffer = Buffer.from(body.fileBase64, "base64");
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
          {
            role: "user",
            content: `File: ${body.fileName ?? "listing.pdf"}\n\nPDF text:\n${pdfText}`
          }
        ]
      })
    });

    if (!response.ok) {
      const message = await response.text();
      return res.status(502).json({
        error: "Fireworks request failed",
        stage: "upstream",
        details: message
      });
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({
        error: "Fireworks returned empty content",
        stage: "upstream",
        details: "No `choices[0].message.content` in Fireworks response."
      });
    }

    const parsed = JSON.parse(content) as ParsedApartment;
    const normalized = normalize(parsed);

    return res.status(200).json(normalized);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to parse PDF. Fill form manually and retry.",
      stage: "server",
      details: error instanceof Error ? error.message : "Unknown server error"
    });
  }
}
