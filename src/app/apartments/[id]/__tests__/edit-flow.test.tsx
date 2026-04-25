import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "42" }),
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

import ApartmentDetailPage from "../page";

const APARTMENT_V1 = {
  id: 42,
  name: "Sonnenweg 3",
  address: "Sonnenweg 3, 8001 Zurich",
  sizeM2: 60,
  numRooms: 2.5,
  numBathrooms: 1,
  numBalconies: 1,
  hasWashingMachine: null,
  rentChf: 2200,
  distanceBikeMin: 12,
  distanceTransitMin: 25,
  pdfUrl: null,
  listingUrl: null,
  summary: "Quiet 2.5-room flat in a leafy district near transit.",
  availableFrom: "2026-05-01",
  ratings: [],
};

const APARTMENT_V2 = {
  ...APARTMENT_V1,
  name: "Sonnenweg 3b",
  rentChf: 2400,
  hasWashingMachine: true,
  summary: "Updated description after edit.",
  availableFrom: "2026-07-15",
};

type FetchCall = { url: string; init: RequestInit };
let fetchCalls: FetchCall[] = [];

beforeEach(() => {
  push.mockReset();
  fetchCalls = [];

  // First GET → V1, second GET (after PATCH) → V2.
  let getCount = 0;
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
    if (url.endsWith("/api/apartments/42") && method === "GET") {
      getCount += 1;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(getCount === 1 ? APARTMENT_V1 : APARTMENT_V2),
      } as Response);
    }
    if (url.endsWith("/api/apartments/42") && method === "PATCH") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(APARTMENT_V2),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);
  }) as typeof fetch);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Apartment detail edit flow", () => {
  it(
    "opens the edit form, saves changes, and re-renders with updated values",
    async () => {
    const user = userEvent.setup();
    render(<ApartmentDetailPage />);

    // Wait for initial load.
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });
    expect(screen.getByText(/CHF 2,200/)).toBeInTheDocument();

    // Click Edit.
    await user.click(screen.getByRole("button", { name: /^Edit$/ }));

    // Form is visible with pre-populated values.
    const nameInput = screen.getByLabelText(/Name/i) as HTMLInputElement;
    const rentInput = screen.getByLabelText(/Rent/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Sonnenweg 3");
    expect(rentInput.value).toBe("2200");

    // Change fields.
    await user.clear(nameInput);
    await user.type(nameInput, "Sonnenweg 3b");
    await user.clear(rentInput);
    await user.type(rentInput, "2400");

    // Toggle washing machine to Yes.
    await user.click(screen.getByRole("button", { name: /^Yes$/ }));

    // Save.
    await user.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => {
      const patchCall = fetchCalls.find(
        (c) => c.url.endsWith("/api/apartments/42") && c.init.method === "PATCH"
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse((patchCall!.init.body as string) ?? "{}");
      expect(body.name).toBe("Sonnenweg 3b");
      expect(body.rentChf).toBe(2400);
      expect(body.hasWashingMachine).toBe(true);
    });

    // Edit form closed, read-only view shows updated values.
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3b")).toBeInTheDocument();
    });
    expect(screen.getByText(/CHF 2,400/)).toBeInTheDocument();
    },
    10000
  );

  it("Cancel discards edits and returns to read-only view", async () => {
    const user = userEvent.setup();
    render(<ApartmentDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /^Edit$/ }));

    const nameInput = screen.getByLabelText(/Name/i) as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Something else");

    // Two Cancel buttons exist on the page (rating form + edit form);
    // click the enabled one (edit form).
    const cancels = screen.getAllByRole("button", { name: /^Cancel$/ });
    const editCancel = cancels.find(
      (b) => !(b as HTMLButtonElement).disabled
    )!;
    await user.click(editCancel);

    // No PATCH was made.
    expect(
      fetchCalls.find((c) => c.init.method === "PATCH")
    ).toBeUndefined();

    // Read-only view still shows the original name.
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });
  });

  it("disables Delete while editing and re-enables it after Cancel", async () => {
    const user = userEvent.setup();
    render(<ApartmentDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });

    const deleteBefore = screen.getByRole("button", { name: /Delete/i });
    expect(deleteBefore).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: /^Edit$/ }));
    expect(screen.getByRole("button", { name: /Delete/i })).toBeDisabled();

    const cancels = screen.getAllByRole("button", { name: /^Cancel$/ });
    const editCancel = cancels.find(
      (b) => !(b as HTMLButtonElement).disabled
    )!;
    await user.click(editCancel);
    expect(screen.getByRole("button", { name: /Delete/i })).not.toBeDisabled();

    // "within" import just to keep the import list stable.
    void within;
  });

  it("displays availableFrom in Swiss format on the read-only view", async () => {
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });
    expect(screen.getByText(/01\.05\.2026/)).toBeInTheDocument();
  });

  it("displays the AI summary in a card on the read-only view", async () => {
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Quiet 2.5-room flat in a leafy district near transit/i)
    ).toBeInTheDocument();
  });

  it(
    "round-trips the summary through the edit form",
    async () => {
      const user = userEvent.setup();
      render(<ApartmentDetailPage />);
      await waitFor(() => {
        expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /^Edit$/ }));

      const summaryField = screen.getByLabelText(/Summary/i) as HTMLTextAreaElement;
      expect(summaryField.value).toBe(
        "Quiet 2.5-room flat in a leafy district near transit."
      );

      await user.clear(summaryField);
      await user.type(summaryField, "Updated description after edit.");

      await user.click(screen.getByRole("button", { name: /^Save$/ }));

      await waitFor(() => {
        const patchCall = fetchCalls.find(
          (c) => c.url.endsWith("/api/apartments/42") && c.init.method === "PATCH"
        );
        expect(patchCall).toBeDefined();
        const body = JSON.parse((patchCall!.init.body as string) ?? "{}");
        expect(body.summary).toBe("Updated description after edit.");
      });
    },
    10000
  );

  it(
    "round-trips the availableFrom date through the edit form",
    async () => {
      const user = userEvent.setup();
      render(<ApartmentDetailPage />);
      await waitFor(() => {
        expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /^Edit$/ }));

      const dateInput = screen.getByLabelText(/Available from/i) as HTMLInputElement;
      expect(dateInput.value).toBe("2026-05-01");

      await user.clear(dateInput);
      await user.type(dateInput, "2026-07-15");

      await user.click(screen.getByRole("button", { name: /^Save$/ }));

      await waitFor(() => {
        const patchCall = fetchCalls.find(
          (c) => c.url.endsWith("/api/apartments/42") && c.init.method === "PATCH"
        );
        expect(patchCall).toBeDefined();
        const body = JSON.parse((patchCall!.init.body as string) ?? "{}");
        expect(body.availableFrom).toBe("2026-07-15");
      });
    },
    10000
  );
});
