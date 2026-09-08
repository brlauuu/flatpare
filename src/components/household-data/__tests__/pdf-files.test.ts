import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateDataKey, openBytes, envelopeAad, fromBase64 } from "@/lib/crypto";

const { mockUploadEncryptedFile } = vi.hoisted(() => ({ mockUploadEncryptedFile: vi.fn() }));
vi.mock("@/lib/upload-pdf", () => ({ uploadEncryptedFile: mockUploadEncryptedFile }));

import { encryptAndUploadPdf, downloadPdf } from "../pdf-files";

const APT = "33333333-3333-4333-8333-333333333333";
const plain = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]); // "%PDF" + bytes

beforeEach(() => {
  mockUploadEncryptedFile.mockResolvedValue(`/api/uploads/households/7/${APT}.pdf.enc`);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("encryptAndUploadPdf", () => {
  it("seals with the pdf AAD and returns path + iv", async () => {
    const key = await generateDataKey();
    const pdf = await encryptAndUploadPdf(key, 7, APT, plain);

    expect(pdf.path).toBe(`/api/uploads/households/7/${APT}.pdf.enc`);
    expect(pdf.iv).toEqual(expect.any(String));

    const [uploaded, apartmentId] = mockUploadEncryptedFile.mock.calls[0] as [Uint8Array<ArrayBuffer>, string];
    expect(apartmentId).toBe(APT);
    expect(uploaded).not.toEqual(plain);
    const opened = await openBytes(key, { iv: pdf.iv, ct: uploaded }, envelopeAad(7, "pdf", APT));
    expect([...opened]).toEqual([...plain]);
  });

  it("uploads the raw bytes with iv null when encryption is off", async () => {
    const pdf = await encryptAndUploadPdf(null, 7, APT, plain);
    expect(pdf.iv).toBeNull();
    const [uploaded] = mockUploadEncryptedFile.mock.calls[0] as [Uint8Array<ArrayBuffer>];
    expect([...uploaded]).toEqual([...plain]);
  });
});

describe("downloadPdf", () => {
  it("fetches the stored path and opens it", async () => {
    const key = await generateDataKey();
    const pdf = await encryptAndUploadPdf(key, 7, APT, plain);
    const [uploaded] = mockUploadEncryptedFile.mock.calls[0] as [Uint8Array<ArrayBuffer>];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toBe(pdf.path);
        return new Response(uploaded, { status: 200 });
      })
    );
    const out = await downloadPdf(key, 7, APT, pdf);
    expect([...out]).toEqual([...plain]);
  });

  it("throws when the file is missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    await expect(downloadPdf(null, 7, APT, { path: "/api/uploads/households/7/x.pdf.enc", iv: null })).rejects.toThrow(
      "PDF not found"
    );
  });

  it("rejects a tampered download", async () => {
    const key = await generateDataKey();
    const pdf = await encryptAndUploadPdf(key, 7, APT, plain);
    const [uploaded] = mockUploadEncryptedFile.mock.calls[0] as [Uint8Array<ArrayBuffer>];
    const tampered = new Uint8Array(uploaded);
    tampered[tampered.length - 1] ^= 0xff;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(tampered, { status: 200 })));
    await expect(downloadPdf(key, 7, APT, pdf)).rejects.toThrow();
  });
});

// Sanity: fromBase64 is the decoder the module uses for the stored iv.
it("stores the iv as base64", async () => {
  const key = await generateDataKey();
  const pdf = await encryptAndUploadPdf(key, 7, APT, plain);
  expect(fromBase64(pdf.iv as string)).toHaveLength(12);
});
