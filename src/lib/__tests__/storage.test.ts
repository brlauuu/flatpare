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
  it("uploads to Vercel Blob under households/<id>/ with access: 'private' and returns an /api/pdf path", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";

    const mockPut = vi.fn(async () => ({
      pathname: "households/7/test.pdf",
      url: "ignored-private-url",
    }));

    vi.doMock("@vercel/blob", () => ({ put: mockPut }));
    vi.doMock("fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("fs/promises")>();
      return { ...actual, default: actual };
    });

    const { uploadFile } = await import("../storage");
    const file = createMockFile("test.pdf");
    const url = await uploadFile(7, "test.pdf", file);

    expect(url).toBe("/api/pdf/households/7/test.pdf");
    expect(mockPut).toHaveBeenCalledWith(
      "households/7/test.pdf",
      file,
      { access: "private" }
    );

    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("uses local filesystem when no BLOB_READ_WRITE_TOKEN, scoped under households/<id>/", async () => {
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
    const url = await uploadFile(7, "local.pdf", file);

    expect(url).toBe("/api/uploads/households/7/local.pdf");
    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringMatching(/households[/\\]7$/),
      { recursive: true }
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringMatching(/households[/\\]7[/\\]local\.pdf$/),
      expect.anything()
    );
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
    const buf = await readStoredFile("/api/pdf/households/7/x.pdf", 7);

    expect(mockGet).toHaveBeenCalledWith("households/7/x.pdf", {
      access: "private",
    });
    expect(buf.toString()).toBe("blob-bytes");
  });

  it("rejects a cloud path belonging to another household without calling get()", async () => {
    const mockGet = vi.fn(async () => ({
      statusCode: 200,
      stream: new Response(new TextEncoder().encode("secret").buffer).body,
    }));

    vi.doMock("@vercel/blob", () => ({ put: vi.fn(), get: mockGet }));
    vi.doMock("fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("fs/promises")>();
      return { ...actual, default: actual };
    });

    const { readStoredFile } = await import("../storage");
    await expect(
      readStoredFile("/api/pdf/households/2/secret.pdf", 1)
    ).rejects.toThrow(/household/);
    expect(mockGet).not.toHaveBeenCalled();
  });

  describe("parser-differential bypass (percent-encoded dot segments)", () => {
    // @vercel/blob's get() string-interpolates the pathname into a URL and
    // hands it to fetch(), which WHATWG-parses it and collapses
    // percent-encoded dot segments. A check against the RAW pathname sees
    // e.g. "%2e%2e" as an opaque filename character, not "..", and passes
    // — while the request that actually leaves the process resolves to a
    // different household entirely. Every vector below must be rejected
    // before get() is ever called, and get() (when it IS called for a
    // legitimate path) must always receive the exact canonicalized string
    // that was checked.
    const vectors = [
      "households/1/%2e%2e/2/secret.pdf",
      "households/1/%2E%2E/2/secret.pdf",
      "households/1/.%2e/2/secret.pdf",
      "households/1/%2e./2/secret.pdf",
      "households/x/%2e%2e/%2e%2e/2/secret.pdf",
    ];

    for (const vector of vectors) {
      it(`rejects ${JSON.stringify(vector)} without calling get()`, async () => {
        const mockGet = vi.fn(async () => ({
          statusCode: 200,
          stream: new Response(
            new TextEncoder().encode("household-2-secret").buffer
          ).body,
        }));

        vi.doMock("@vercel/blob", () => ({ put: vi.fn(), get: mockGet }));
        vi.doMock("fs/promises", async (importOriginal) => {
          const actual = await importOriginal<typeof import("fs/promises")>();
          return { ...actual, default: actual };
        });

        const { readStoredFile } = await import("../storage");
        await expect(
          readStoredFile(`/api/pdf/${vector}`, 1)
        ).rejects.toThrow(/household/);
        expect(mockGet).not.toHaveBeenCalled();
      });
    }

    it("passes get() the exact canonicalized string that was checked — not the raw input", async () => {
      let receivedPathname: string | undefined;
      const mockGet = vi.fn(async (pathname: string) => {
        receivedPathname = pathname;
        return {
          statusCode: 200,
          stream: new Response(new TextEncoder().encode("own-bytes").buffer)
            .body,
        };
      });

      vi.doMock("@vercel/blob", () => ({ put: vi.fn(), get: mockGet }));
      vi.doMock("fs/promises", async (importOriginal) => {
        const actual = await importOriginal<typeof import("fs/promises")>();
        return { ...actual, default: actual };
      });

      const { readStoredFile, householdIdFromStoredPath } = await import(
        "../storage"
      );

      // A raw pathname that is byte-different from its canonical form, but
      // still resolves to the caller's own household once canonicalized.
      const rawPathname = "households/1/./listing.pdf";
      await readStoredFile(`/api/pdf/${rawPathname}`, 1);

      expect(receivedPathname).toBeDefined();
      // The checked property, not just "it worked": whatever string was
      // handed to get() is EXACTLY the string householdIdFromStoredPath
      // would validate — the check and the fetch operated on one string,
      // not two.
      expect(householdIdFromStoredPath(receivedPathname!)).toBe(1);
      expect(receivedPathname).not.toBe(rawPathname);
      expect(receivedPathname).toBe("households/1/listing.pdf");
    });
  });

  it("throws when the blob is missing", async () => {
    const mockGet = vi.fn(async () => null);

    vi.doMock("@vercel/blob", () => ({ put: vi.fn(), get: mockGet }));
    vi.doMock("fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("fs/promises")>();
      return { ...actual, default: actual };
    });

    const { readStoredFile } = await import("../storage");
    await expect(
      readStoredFile("/api/pdf/households/7/missing.pdf", 7)
    ).rejects.toThrow(/Blob not found/);
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
    const buf = await readStoredFile(
      "/api/uploads/households/7/file%20with%20spaces.pdf",
      7
    );

    expect(buf.toString()).toBe("disk-bytes");
    // Filename was URL-decoded before reading from disk.
    expect(mockReadFile).toHaveBeenCalledWith(
      expect.stringMatching(/households[/\\]7[/\\]file with spaces\.pdf$/)
    );
  });

  it("rejects a local path with no household prefix", async () => {
    vi.doMock("@vercel/blob", () => ({ put: vi.fn(), get: vi.fn() }));
    vi.doMock("fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("fs/promises")>();
      return { ...actual, default: actual };
    });

    const { readStoredFile } = await import("../storage");
    await expect(
      readStoredFile("/api/uploads/apartments/x.pdf", 7)
    ).rejects.toThrow(/household/);
  });

  it("rejects a local path belonging to another household without reading disk", async () => {
    const mockReadFile = vi.fn(async () => Buffer.from("secret"));

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
    await expect(
      readStoredFile("/api/uploads/households/2/secret.pdf", 1)
    ).rejects.toThrow(/household/);
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("rejects a traversal attempt via the household-prefix check (not the containment check)", async () => {
    vi.doMock("@vercel/blob", () => ({ put: vi.fn(), get: vi.fn() }));
    vi.doMock("fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("fs/promises")>();
      return { ...actual, default: actual };
    });

    const { readStoredFile } = await import("../storage");
    // householdIdFromStoredPath rejects the ".." segment before the
    // resolved-path containment check ever runs, so this exercises the
    // prefix check, not path.resolve() containment.
    await expect(
      readStoredFile("/api/uploads/households/7/../8/secret.pdf", 7)
    ).rejects.toThrow(/household/);
  });

  it("throws on an unrecognized URL prefix", async () => {
    vi.doMock("@vercel/blob", () => ({ put: vi.fn(), get: vi.fn() }));
    vi.doMock("fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("fs/promises")>();
      return { ...actual, default: actual };
    });

    const { readStoredFile } = await import("../storage");
    await expect(readStoredFile("https://example.com/x.pdf", 1)).rejects.toThrow(
      /Unrecognized stored URL/
    );
  });
});
