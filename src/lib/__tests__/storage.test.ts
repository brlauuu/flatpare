import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

beforeEach(() => {
  vi.clearAllMocks();
});

function createMockFile(name: string): File {
  const blob = new Blob(["fake-pdf-content"], { type: "application/pdf" });
  return new File([blob], name, { type: "application/pdf" });
}

describe("uploadFile", () => {
  it("uploads to Vercel Blob with access: 'private' and returns an /api/pdf path", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";

    const mockPut = vi.fn(async () => ({
      pathname: "apartments/test.pdf",
      url: "ignored-private-url",
    }));

    vi.doMock("@vercel/blob", () => ({ put: mockPut }));
    vi.doMock("fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("fs/promises")>();
      return { ...actual, default: actual };
    });

    const { uploadFile } = await import("../storage");
    const file = createMockFile("test.pdf");
    const url = await uploadFile("test.pdf", file);

    expect(url).toBe("/api/pdf/apartments/test.pdf");
    expect(mockPut).toHaveBeenCalledWith(
      "apartments/test.pdf",
      file,
      { access: "private" }
    );

    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("uses local filesystem when no BLOB_READ_WRITE_TOKEN", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;

    const mockWriteFile = vi.fn(async () => {});
    const mockMkdir = vi.fn(async () => undefined);

    vi.doMock("@vercel/blob", () => ({ put: vi.fn() }));
    vi.doMock("fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("fs/promises")>();
      return {
        ...actual,
        default: { ...actual, writeFile: mockWriteFile, mkdir: mockMkdir },
        writeFile: mockWriteFile,
        mkdir: mockMkdir,
      };
    });

    const { uploadFile } = await import("../storage");
    const file = createMockFile("local.pdf");
    const url = await uploadFile("local.pdf", file);

    expect(url).toBe("/api/uploads/local.pdf");
    expect(mockMkdir).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalled();
  });
});

describe("readStoredFile", () => {
  it("fetches from Vercel Blob when given an /api/pdf/ URL", async () => {
    const blobBytes = new TextEncoder().encode("blob-bytes").buffer;
    const mockGet = vi.fn(async () => ({
      statusCode: 200,
      stream: new Response(blobBytes).body,
    }));

    vi.doMock("@vercel/blob", () => ({ put: vi.fn(), get: mockGet }));
    vi.doMock("fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("fs/promises")>();
      return { ...actual, default: actual };
    });

    const { readStoredFile } = await import("../storage");
    const buf = await readStoredFile("/api/pdf/apartments/x.pdf");

    expect(mockGet).toHaveBeenCalledWith("apartments/x.pdf", { access: "private" });
    expect(buf.toString()).toBe("blob-bytes");
  });

  it("throws when the blob is missing", async () => {
    const mockGet = vi.fn(async () => null);

    vi.doMock("@vercel/blob", () => ({ put: vi.fn(), get: mockGet }));
    vi.doMock("fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("fs/promises")>();
      return { ...actual, default: actual };
    });

    const { readStoredFile } = await import("../storage");
    await expect(readStoredFile("/api/pdf/missing.pdf")).rejects.toThrow(
      /Blob not found/
    );
  });

  it("reads from local disk when given an /api/uploads/ URL", async () => {
    const mockReadFile = vi.fn(async () => Buffer.from("disk-bytes"));

    vi.doMock("@vercel/blob", () => ({ put: vi.fn(), get: vi.fn() }));
    vi.doMock("fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("fs/promises")>();
      return {
        ...actual,
        default: { ...actual, readFile: mockReadFile },
        readFile: mockReadFile,
      };
    });

    const { readStoredFile } = await import("../storage");
    const buf = await readStoredFile("/api/uploads/file%20with%20spaces.pdf");

    expect(buf.toString()).toBe("disk-bytes");
    // Filename was URL-decoded before reading from disk.
    expect(mockReadFile).toHaveBeenCalledWith(
      expect.stringMatching(/file with spaces\.pdf$/)
    );
  });

  it("throws on an unrecognized URL prefix", async () => {
    vi.doMock("@vercel/blob", () => ({ put: vi.fn(), get: vi.fn() }));
    vi.doMock("fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("fs/promises")>();
      return { ...actual, default: actual };
    });

    const { readStoredFile } = await import("../storage");
    await expect(readStoredFile("https://example.com/x.pdf")).rejects.toThrow(
      /Unrecognized stored URL/
    );
  });
});
