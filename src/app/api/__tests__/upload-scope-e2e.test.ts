// @vitest-environment node
//
// Task 4b end-to-end shape: a blob key minted the way
// src/lib/upload-pdf.ts mints it (`households/<id>/<ts>-<filename>`) must
// (a) be issuable only for the caller's own household via
// /api/parse-pdf/upload-token, and (b) be readable back through
// /api/pdf/[...path] by that same household, and 404 for a different one.
// Uses the real @vercel/blob/client handleUpload (not a mock) for the
// token-mint half, so this exercises the actual onBeforeGenerateToken
// guard rather than a mock's recorded call.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockRequireHousehold } = vi.hoisted(() => ({
  mockRequireHousehold: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireHousehold: mockRequireHousehold,
}));

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  get: mockGet,
}));

import { POST as mintToken } from "../parse-pdf/upload-token/route";
import { GET as readPdf } from "../pdf/[...path]/route";

function mintKeyForFile(householdId: number, filename: string) {
  return `households/${householdId}/${Date.now()}-${filename}`;
}

async function requestToken(pathname: string) {
  const req = new Request("http://localhost/api/parse-pdf/upload-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "blob.generate-client-token",
      payload: { pathname, clientPayload: null, multipart: false },
    }),
  });
  return mintToken(req);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_teststore1234567890";
});

afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  vi.restoreAllMocks();
});

describe("upload-pdf.ts key shape — mint then read (Task 4b)", () => {
  it("mints a token for a key under the caller's household, then reads it back for that household", async () => {
    mockRequireHousehold.mockResolvedValue({
      householdId: 1,
      userId: "u1",
      role: "owner",
    });

    const key = mintKeyForFile(1, "listing.pdf");

    const tokenRes = await requestToken(key);
    expect(tokenRes.status).toBe(200);
    const tokenData = await tokenRes.json();
    expect(typeof tokenData.clientToken).toBe("string");

    // Now read it back as household 1 — the key's own owner.
    mockGet.mockResolvedValueOnce({
      statusCode: 200,
      stream: new ReadableStream({ start: (c) => c.close() }),
      headers: new Headers({ "content-type": "application/pdf" }),
      blob: { contentDisposition: "inline" },
    });
    const readRes = await readPdf(new Request(`http://localhost/api/pdf/${key}`), {
      params: Promise.resolve({ path: key.split("/") }),
    });
    expect(readRes.status).toBe(200);
    expect(mockGet).toHaveBeenCalledWith(key, { access: "private" });
  });

  it("404s reading household 1's key as household 2", async () => {
    mockRequireHousehold.mockResolvedValue({
      householdId: 1,
      userId: "u1",
      role: "owner",
    });
    const key = mintKeyForFile(1, "listing.pdf");
    const tokenRes = await requestToken(key);
    expect(tokenRes.status).toBe(200);

    // Different household attempts to read the same key.
    mockRequireHousehold.mockResolvedValue({
      householdId: 2,
      userId: "u2",
      role: "owner",
    });
    const readRes = await readPdf(new Request(`http://localhost/api/pdf/${key}`), {
      params: Promise.resolve({ path: key.split("/") }),
    });
    expect(readRes.status).toBe(404);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("refuses to mint a token for a key naming another household outright", async () => {
    mockRequireHousehold.mockResolvedValue({
      householdId: 1,
      userId: "u1",
      role: "owner",
    });
    const key = mintKeyForFile(2, "secret.pdf");
    const tokenRes = await requestToken(key);
    expect(tokenRes.status).toBe(400);
    const data = await tokenRes.json();
    expect(data.clientToken).toBeUndefined();
  });
});
