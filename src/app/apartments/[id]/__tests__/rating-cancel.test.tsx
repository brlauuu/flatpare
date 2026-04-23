import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "42" }),
  useRouter: () => ({ push, refresh }),
}));

import ApartmentDetailPage from "../page";

const BASE_APARTMENT = {
  id: 42,
  name: "Test Flat",
  address: null,
  sizeM2: null,
  numRooms: null,
  numBathrooms: null,
  numBalconies: null,
  hasWashingMachine: null,
  rentChf: null,
  distanceBikeMin: null,
  distanceTransitMin: null,
  pdfUrl: null,
  listingUrl: null,
  shortCode: "ABC-?B-?b-W?-?",
  ratings: [
    {
      id: 1,
      userName: "Alice",
      kitchen: 3,
      balconies: 3,
      location: 3,
      floorplan: 3,
      overallFeeling: 3,
      comment: "saved text",
    },
  ],
};

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  // Current user is Alice (via cookie)
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
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/apartments/42") && method === "GET") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(BASE_APARTMENT),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  }) as typeof fetch);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Rating cancel", () => {
  it("Save and Cancel are disabled when the rating is pristine", async () => {
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Your Rating \(Alice\)/)).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /Save Rating/ })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Cancel$/ })).toBeDisabled();
  });

  it("Cancel reverts an unsaved comment change and re-disables both buttons", async () => {
    const user = userEvent.setup();
    render(<ApartmentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Your Rating \(Alice\)/)).toBeInTheDocument();
    });

    const comment = screen.getByPlaceholderText(
      /Notes about this apartment/i
    ) as HTMLTextAreaElement;
    expect(comment.value).toBe("saved text");

    await user.clear(comment);
    await user.type(comment, "edited but not saved");
    expect(comment.value).toBe("edited but not saved");

    // Dirty → buttons active
    expect(
      screen.getByRole("button", { name: /Save Rating/ })
    ).not.toBeDisabled();
    expect(
      screen.getByRole("button", { name: /^Cancel$/ })
    ).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: /^Cancel$/ }));

    // Reverted
    expect(comment.value).toBe("saved text");
    expect(
      screen.getByRole("button", { name: /Save Rating/ })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Cancel$/ })).toBeDisabled();
  });
});
