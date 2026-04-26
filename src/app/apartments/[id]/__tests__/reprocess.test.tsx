import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "42" }),
  useRouter: () => ({ push, refresh }),
}));

import ApartmentDetailPage from "../page";

const APT_WITH_PDF = {
  id: 42,
  name: "Sonnenweg 3",
  address: "Sonnenweg 3, 8001 Zürich",
  sizeM2: 60,
  numRooms: 2.5,
  numBathrooms: 1,
  numBalconies: 1,
  hasWashingMachine: false,
  rentChf: 2200,
  pdfUrl: "https://blob.example/sonnenweg.pdf" as string | null,
  listingUrl: null,
  shortCode: "ABC-2.5B-WY-4057",
  summary: "Original AI summary.",
  availableFrom: null,
  userEditedFields: null,
  ratings: [],
  distances: [] as { locationId: number; bikeMin: number | null; transitMin: number | null }[],
};

const APT_WITH_PDF_REFRESHED = {
  ...APT_WITH_PDF,
  summary: "Refreshed summary after reprocess.",
};

const APT_NO_PDF = { ...APT_WITH_PDF, pdfUrl: null };

let fetchCalls: { url: string; init: RequestInit }[] = [];
let detailResponse: typeof APT_WITH_PDF = APT_WITH_PDF;
let reprocessResponse: { ok: boolean; status: number; body: unknown } = {
  ok: true,
  status: 200,
  body: APT_WITH_PDF_REFRESHED,
};

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  fetchCalls = [];
  detailResponse = APT_WITH_PDF;
  reprocessResponse = {
    ok: true,
    status: 200,
    body: APT_WITH_PDF_REFRESHED,
  };

  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => "flatpare-name=Alice",
    set: () => {},
  });

  vi.spyOn(global, "fetch").mockImplementation(((
    input: RequestInfo,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    fetchCalls.push({ url, init: init ?? {} });
    const method = init?.method ?? "GET";

    if (url === "/api/apartments" && method === "GET") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);
    }
    if (url.endsWith("/api/apartments/42/reprocess") && method === "POST") {
      const body = reprocessResponse.body;
      return Promise.resolve({
        ok: reprocessResponse.ok,
        status: reprocessResponse.status,
        json: () => Promise.resolve(body),
      } as Response);
    }
    if (url.endsWith("/api/apartments/42") && method === "GET") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(detailResponse),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  }) as typeof fetch);

  vi.stubGlobal("confirm", () => true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Apartment detail — reprocess", () => {
  it("clicking Reprocess calls the endpoint and reloads the apartment", async () => {
    const user = userEvent.setup();
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });
    expect(screen.getByText("Original AI summary.")).toBeInTheDocument();

    detailResponse = APT_WITH_PDF_REFRESHED;

    await user.click(screen.getByRole("button", { name: /Reprocess/i }));

    await waitFor(() => {
      const reprocessCall = fetchCalls.find((c) =>
        c.url.endsWith("/api/apartments/42/reprocess")
      );
      expect(reprocessCall).toBeDefined();
      expect(reprocessCall!.init.method).toBe("POST");
    });
    await waitFor(() => {
      expect(
        screen.getByText("Refreshed summary after reprocess.")
      ).toBeInTheDocument();
    });
  });

  it("Reprocess button is disabled when the apartment has no pdfUrl", async () => {
    detailResponse = APT_NO_PDF;
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Reprocess/i })).toBeDisabled();
  });

  it("renders an error when reprocess returns a quota error", async () => {
    reprocessResponse = {
      ok: false,
      status: 429,
      body: {
        error: "AI quota exceeded — try again in 34s.",
        reason: "quota",
        retryAfterSeconds: 34,
      },
    };
    const user = userEvent.setup();
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Reprocess/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/Couldn't reprocess apartment/i)
      ).toBeInTheDocument();
    });
  });
});
