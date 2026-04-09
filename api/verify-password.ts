import { timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type VerifyPasswordBody = {
  password?: string;
};

function safeEquals(input: string, expected: string): boolean {
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);

  if (inputBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(inputBuffer, expectedBuffer);
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const configuredPassword = process.env.APP_PASSWORD;
  if (!configuredPassword) {
    return res.status(500).json({ ok: false, error: "APP_PASSWORD missing" });
  }

  const body = (req.body ?? {}) as VerifyPasswordBody;
  const password = body.password ?? "";

  if (!safeEquals(password, configuredPassword)) {
    return res.status(401).json({ ok: false });
  }

  return res.status(200).json({ ok: true });
}
