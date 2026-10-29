import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeApartmentView, renderWithHouseholdData } from "@/components/household-data/__tests__/fake-household-data";
import { StaleKeyError } from "@/components/household-data/household-data-provider";
import { ApiClientError } from "@/components/household-data/api-client";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

import ApartmentsPage from "../page";

function setClipboard(readText: (() => Promise<string>) | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    value: readText ? { readText } : undefined,
    configurable: true,
  });
}

beforeEach(() => pushMock.mockReset());
afterEach(() => {
  cleanup();
  setClipboard(undefined);
});

// #413: a pasted link becomes an unprocessed apartment, free, and the page
// opens it so the address or the PDF can be added there.
describe("Paste link", () => {
  it("adds an apartment for a link on the clipboard and opens it", async () => {
    setClipboard(vi.fn().mockResolvedValue("see https://x.ch/a now"));
    const { value: data } = renderWithHouseholdData(<ApartmentsPage />, {});
    await userEvent.click(screen.getByRole("button", { name: "Paste link" }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/apartments/apt-from-link"));
    expect(data.createApartmentFromLink).toHaveBeenCalledWith("see https://x.ch/a now", null);
  });

  it("says so when the clipboard holds no link", async () => {
    setClipboard(vi.fn().mockResolvedValue("just words"));
    renderWithHouseholdData(<ApartmentsPage />, {
      createApartmentFromLink: vi.fn().mockRejectedValue(new Error("Not a web link")),
    });
    await userEvent.click(screen.getByRole("button", { name: "Paste link" }));
    expect(await screen.findByText(/no link/i)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("falls back to a field when reading fails, and Save adds the apartment", async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    const { value: data } = renderWithHouseholdData(<ApartmentsPage />, {});
    await userEvent.click(screen.getByRole("button", { name: "Paste link" }));
    const field = await screen.findByLabelText("Paste the link here");
    await userEvent.type(field, "Look at this https://y.ch/b please");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(data.createApartmentFromLink).toHaveBeenCalledWith("Look at this https://y.ch/b please", null)
    );
  });

  it("falls back to the field when the clipboard API is missing", async () => {
    setClipboard(undefined);
    renderWithHouseholdData(<ApartmentsPage />, {});
    await userEvent.click(screen.getByRole("button", { name: "Paste link" }));
    expect(await screen.findByLabelText("Paste the link here")).toBeInTheDocument();
  });

  it("puts store errors in the reader's language", async () => {
    setClipboard(vi.fn().mockResolvedValue("https://x.ch/a"));
    renderWithHouseholdData(<ApartmentsPage />, {
      createApartmentFromLink: vi.fn().mockRejectedValue(new StaleKeyError()),
    });
    await userEvent.click(screen.getByRole("button", { name: "Paste link" }));
    expect(await screen.findByText(/household key was changed/)).toBeInTheDocument();
  });

  it("says the household is at its cap when the server refuses", async () => {
    setClipboard(vi.fn().mockResolvedValue("https://x.ch/a"));
    renderWithHouseholdData(<ApartmentsPage />, {
      createApartmentFromLink: vi.fn().mockRejectedValue(new ApiClientError(409, "Apartment limit reached", {})),
    });
    await userEvent.click(screen.getByRole("button", { name: "Paste link" }));
    expect(await screen.findByText(/holds as many apartments as it may/)).toBeInTheDocument();
  });

  it("is not offered once the apartment limit is reached", () => {
    renderWithHouseholdData(<ApartmentsPage />, {
      apartments: [makeApartmentView({ id: "a1" })],
      limits: { maxMembers: null, maxApartments: 1 },
    });
    expect(screen.queryByRole("button", { name: "Paste link" })).toBeNull();
    expect(screen.getByText("Limit reached")).toBeInTheDocument();
  });

  it("is offered in the empty state", () => {
    renderWithHouseholdData(<ApartmentsPage />, { apartments: [] });
    expect(screen.getByRole("button", { name: "Paste link" })).toBeInTheDocument();
  });
});
