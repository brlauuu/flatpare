import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockUpload } = vi.hoisted(() => ({ mockUpload: vi.fn() }));
vi.mock("@vercel/blob/client", () => ({ upload: mockUpload }));

import { uploadEncryptedFile, _resetBlobModeProbeForTests } from "@/lib/upload-pdf";

const APT = "22222222-2222-4222-8222-222222222222";
const bytes = new Uint8Array([7, 8, 9]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  _resetBlobModeProbeForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadEncryptedFile", () => {
  it("uploads straight to Blob when the token probe is enabled", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/files/upload-token") return jsonResponse({ enabled: true, householdId: 7 });
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    mockUpload.mockResolvedValue({ pathname: `households/7/${APT}.pdf.enc` });

    const path = await uploadEncryptedFile(bytes, APT);

    expect(path).toBe(`/api/pdf/households/7/${APT}.pdf.enc`);
    const [pathname, body, opts] = mockUpload.mock.calls[0];
    expect(pathname).toBe(`households/7/${APT}.pdf.enc`);
    expect(body).toBeInstanceOf(Blob);
    expect(opts).toMatchObject({
      access: "private",
      handleUploadUrl: "/api/files/upload-token",
      contentType: "application/octet-stream",
    });
  });

  it("falls back to multipart POST /api/files when the probe is disabled", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/files/upload-token") return jsonResponse({ enabled: false }, 404);
      if (url === "/api/files") {
        const form = init?.body as FormData;
        expect(form.get("apartmentId")).toBe(APT);
        expect(form.get("file")).toBeInstanceOf(Blob);
        return jsonResponse({ path: `/api/uploads/households/7/${APT}.pdf.enc` }, 201);
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const path = await uploadEncryptedFile(bytes, APT);
    expect(path).toBe(`/api/uploads/households/7/${APT}.pdf.enc`);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("throws with the server's message when the multipart upload fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/files/upload-token"
          ? jsonResponse({ enabled: false }, 404)
          : jsonResponse({ error: "Missing file" }, 400)
      )
    );
    await expect(uploadEncryptedFile(bytes, APT)).rejects.toThrow("Missing file");
  });

  it("caches the probe across calls", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === "/api/files/upload-token"
        ? jsonResponse({ enabled: true, householdId: 7 })
        : jsonResponse({}, 500)
    );
    vi.stubGlobal("fetch", fetchMock);
    mockUpload.mockResolvedValue({ pathname: `households/7/${APT}.pdf.enc` });
    await uploadEncryptedFile(bytes, APT);
    await uploadEncryptedFile(bytes, APT);
    expect(fetchMock.mock.calls.filter(([u]) => u === "/api/files/upload-token")).toHaveLength(1);
  });
});
