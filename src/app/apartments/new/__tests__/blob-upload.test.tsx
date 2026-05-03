import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

const blobUploadMock = vi.fn();

vi.mock("@vercel/blob/client", () => ({
  upload: (...args: unknown[]) => blobUploadMock(...args),
}));

import UploadPage from "../page";
import { _resetBlobModeProbeForTests } from "@/lib/upload-pdf";

function makePdfFile(name = "listing.pdf"): File {
  const blob = new Blob(["%PDF-1.4\n...\n"], { type: "application/pdf" });
  return new File([blob], name, { type: "application/pdf" });
}

function probeResponse(enabled: boolean) {
  return {
    ok: enabled,
    status: enabled ? 200 : 404,
    json: () => Promise.resolve({ enabled }),
  } as Response;
}

function jsonResponse(body: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response;
}

async function dropPdf(user: ReturnType<typeof userEvent.setup>, file: File) {
  const input = document.querySelector(
    'input[type="file"]'
  ) as HTMLInputElement;
  expect(input).toBeTruthy();
  await user.upload(input, file);
}

beforeEach(() => {
  pushMock.mockReset();
  blobUploadMock.mockReset();
  _resetBlobModeProbeForTests();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Upload page — client-direct Vercel Blob path", () => {
  it("uploads via @vercel/blob/client when upload-token probe is enabled", async () => {
    blobUploadMock.mockResolvedValue({
      pathname: "apartments/123-listing.pdf",
    });

    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/parse-pdf/upload-token")) {
          return probeResponse(true);
        }
        if (url === "/api/parse-pdf" && init?.method === "POST") {
          // Verify the route is called with a JSON body referencing the blob.
          const body = JSON.parse(init.body as string);
          expect(body.pathname).toBe("apartments/123-listing.pdf");
          expect(body.filename).toBe("listing.pdf");
          return jsonResponse({
            pdfUrl: "/api/pdf/apartments/123-listing.pdf",
            extracted: {
              name: "Big Apartment",
              address: null,
              sizeM2: null,
              numRooms: null,
              numBathrooms: null,
              numBalconies: null,
              hasWashingMachine: null,
              rentChf: null,
              listingUrl: null,
            },
            aiAvailable: true,
          });
        }
        throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
      });

    const user = userEvent.setup();
    render(<UploadPage />);
    await dropPdf(user, makePdfFile("listing.pdf"));

    await waitFor(() => {
      expect(screen.getByText("Big Apartment")).toBeInTheDocument();
    });

    expect(blobUploadMock).toHaveBeenCalledTimes(1);
    const [pathname, file, opts] = blobUploadMock.mock.calls[0] as [
      string,
      File,
      Record<string, unknown>
    ];
    expect(pathname).toMatch(/^apartments\/\d+-listing\.pdf$/);
    expect(file.name).toBe("listing.pdf");
    expect(opts.access).toBe("private");
    expect(opts.handleUploadUrl).toBe("/api/parse-pdf/upload-token");
    expect(opts.contentType).toBe("application/pdf");

    // No multipart POST happened — the route was invoked with JSON instead.
    const multipartCalls = fetchSpy.mock.calls.filter(
      (c) =>
        String(c[0]) === "/api/parse-pdf" &&
        (c[1]?.body as unknown) instanceof FormData
    );
    expect(multipartCalls).toHaveLength(0);
  });

  it("falls back to multipart upload when the probe reports unconfigured", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/parse-pdf/upload-token")) {
          return probeResponse(false);
        }
        if (url === "/api/parse-pdf" && init?.method === "POST") {
          // Multipart, not JSON.
          expect(init.body).toBeInstanceOf(FormData);
          return jsonResponse({
            pdfUrl: "https://blob.example/listing.pdf",
            extracted: {
              name: "Small Apartment",
              address: null,
              sizeM2: null,
              numRooms: null,
              numBathrooms: null,
              numBalconies: null,
              hasWashingMachine: null,
              rentChf: null,
              listingUrl: null,
            },
            aiAvailable: true,
          });
        }
        throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
      }
    );

    const user = userEvent.setup();
    render(<UploadPage />);
    await dropPdf(user, makePdfFile("small.pdf"));

    await waitFor(() => {
      expect(screen.getByText("Small Apartment")).toBeInTheDocument();
    });

    expect(blobUploadMock).not.toHaveBeenCalled();
  });
});
