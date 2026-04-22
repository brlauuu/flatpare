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
