import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

import UploadPage from "../page";
import { _resetBlobModeProbeForTests } from "@/lib/upload-pdf";

function makePdfFile(name = "listing.pdf"): File {
  const blob = new Blob(["%PDF-1.4\n...\n"], { type: "application/pdf" });
  return new File([blob], name, { type: "application/pdf" });
}

function successResponse() {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        pdfUrl: "https://blob.example/listing.pdf",
        extracted: {
          name: "Parsed Apartment",
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
      }),
  } as Response;
}

function errorResponse(status: number, body: Record<string, unknown>) {
  const res = {
    ok: false,
    status,
    statusText: "Error",
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    clone() {
      return res;
    },
  };
  return res as unknown as Response;
}

async function dropPdf(user: ReturnType<typeof userEvent.setup>, file: File) {
  const input = document.querySelector(
    'input[type="file"]'
  ) as HTMLInputElement;
  expect(input).toBeTruthy();
  await user.upload(input, file);
}

function probeResponse(enabled: boolean) {
  return {
    ok: enabled,
    status: enabled ? 200 : 404,
    json: () => Promise.resolve({ enabled }),
  } as Response;
}

// Mocks fetch so the upload-token probe always reports "not configured"
// (forcing the multipart fallback path), and parse-pdf calls get the
// supplied responses in order.
function mockParsePdf(...responses: Response[]) {
  let i = 0;
  return vi
    .spyOn(global, "fetch")
    .mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/parse-pdf/upload-token")) {
        return probeResponse(false);
      }
      const next = responses[i++];
      if (!next) throw new Error(`No mocked response for fetch #${i} to ${url}`);
      return next;
    });
}

beforeEach(() => {
  pushMock.mockReset();
  _resetBlobModeProbeForTests();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Upload page — retry", () => {
  it("renders a Retry button and the parsed message on a quota error", async () => {
    mockParsePdf(
      errorResponse(429, {
        error: "AI quota exceeded — try again in 34s.",
        reason: "quota",
        retryAfterSeconds: 34,
      })
    );
    const user = userEvent.setup();
    render(<UploadPage />);
    await dropPdf(user, makePdfFile());
    await waitFor(() => {
      expect(screen.getByText(/AI quota exceeded.*34s/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Retry/i })).toBeEnabled();
  });

  it("re-submits the same file on Retry and transitions to done", async () => {
    const user = userEvent.setup();
    const fetchSpy = mockParsePdf(
      errorResponse(429, {
        error: "AI quota exceeded — try again in 34s.",
        reason: "quota",
        retryAfterSeconds: 34,
      }),
      successResponse()
    );
    render(<UploadPage />);
    await dropPdf(user, makePdfFile("listing.pdf"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Retry/i }));
    await waitFor(() => {
      expect(screen.getByText("Parsed Apartment")).toBeInTheDocument();
    });
    const parsePdfCalls = fetchSpy.mock.calls.filter(
      (c) => String(c[0]) === "/api/parse-pdf"
    );
    expect(parsePdfCalls).toHaveLength(2);
    const body = parsePdfCalls[1][1]?.body as FormData;
    expect((body.get("file") as File).name).toBe("listing.pdf");
  });

  it("shows the Retry button on an invalid_pdf error", async () => {
    mockParsePdf(
      errorResponse(400, {
        error:
          "Couldn't read this PDF. It may be corrupted or an unsupported format.",
        reason: "invalid_pdf",
      })
    );
    const user = userEvent.setup();
    render(<UploadPage />);
    await dropPdf(user, makePdfFile());
    await waitFor(() => {
      expect(screen.getByText(/Couldn't read this PDF/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Retry/i })).toBeEnabled();
  });

  it("shows the Retry button on an unknown error", async () => {
    mockParsePdf(
      errorResponse(500, {
        error: "Parsing failed: ECONNRESET",
        reason: "unknown",
      })
    );
    const user = userEvent.setup();
    render(<UploadPage />);
    await dropPdf(user, makePdfFile());
    await waitFor(() => {
      expect(screen.getByText(/Parsing failed.*ECONNRESET/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Retry/i })).toBeEnabled();
  });
});
