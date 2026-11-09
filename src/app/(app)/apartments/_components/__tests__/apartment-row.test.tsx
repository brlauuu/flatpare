import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  renderWithHouseholdData,
  makeApartmentView,
} from "@/components/household-data/__tests__/fake-household-data";
import { ApartmentRow } from "../apartment-row";

const APT = makeApartmentView({ id: "a1", name: "Sonnenweg 3" });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// #483: the list row deletes the way the tile does (#437).
describe("ApartmentRow quick delete", () => {
  it("names the apartment, and sits beside the link rather than inside it", () => {
    renderWithHouseholdData(<ApartmentRow apt={APT} />);
    const button = screen.getByRole("button", { name: "Delete Sonnenweg 3" });
    expect(button.closest("a")).toBeNull();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/apartments/a1");
  });

  it("has the tile's 44px touch target on a phone", () => {
    renderWithHouseholdData(<ApartmentRow apt={APT} />);
    expect(screen.getByRole("button", { name: "Delete Sonnenweg 3" })).toHaveClass(
      "h-11",
      "w-11",
      "sm:h-8",
      "sm:w-8"
    );
  });

  it("deletes the apartment once confirmed", async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<ApartmentRow apt={APT} />);
    await user.click(screen.getByRole("button", { name: "Delete Sonnenweg 3" }));
    expect(confirm).toHaveBeenCalledWith('Delete "Sonnenweg 3"? This cannot be undone.');
    await waitFor(() => expect(value.deleteApartment).toHaveBeenCalledWith("a1"));
  });

  it("deletes nothing when the confirmation is declined", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<ApartmentRow apt={APT} />);
    await user.click(screen.getByRole("button", { name: "Delete Sonnenweg 3" }));
    expect(value.deleteApartment).not.toHaveBeenCalled();
  });

  it("says so when the delete fails, and offers the button again", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<ApartmentRow apt={APT} />);
    vi.mocked(value.deleteApartment).mockRejectedValueOnce(new Error("Network error"));
    await user.click(screen.getByRole("button", { name: "Delete Sonnenweg 3" }));
    expect(await screen.findByRole("alert")).toHaveTextContent('Couldn\'t delete "Sonnenweg 3". Try again.');
    expect(screen.getByRole("button", { name: "Delete Sonnenweg 3" })).toBeEnabled();
  });
});

// #483: the tile's rating summary, in place of the rated badge and the stars.
describe("ApartmentRow ratings", () => {
  function summary() {
    return document.querySelector("[data-row-status] [data-rating-summary]")!;
  }

  it("shows everyone's average and mine in parentheses", () => {
    renderWithHouseholdData(<ApartmentRow apt={{ ...APT, avgOverall: 4.25, myRating: 5 }} />);
    expect(summary()).toHaveTextContent("4.3 (5)");
    expect(summary()).toHaveAttribute("title", "Average 4.3 of 5, your rating 5");
  });

  it("shows a dash for mine when others rated it and I have not", () => {
    renderWithHouseholdData(<ApartmentRow apt={{ ...APT, avgOverall: 3.5, myRating: null }} />);
    expect(summary()).toHaveTextContent("3.5 (–)");
    expect(summary()).toHaveAttribute("title", "Average 3.5 of 5, you have not rated it");
  });

  it("shows a dash alone before anyone rated it", () => {
    renderWithHouseholdData(<ApartmentRow apt={{ ...APT, avgOverall: null, myRating: null }} />);
    expect(summary()).toHaveTextContent("–");
    expect(summary()).toHaveAttribute("title", "No ratings yet");
  });

  it("has no rated badge and no row of stars any more", () => {
    renderWithHouseholdData(<ApartmentRow apt={{ ...APT, avgOverall: 4, myRating: 4 }} />);
    expect(screen.queryByText("Rated")).toBeNull();
    expect(screen.queryByText("Not yet rated")).toBeNull();
    // One star in the row: the summary's.
    expect(screen.getByRole("link").querySelectorAll("svg.lucide-star")).toHaveLength(1);
  });

  it("puts the name on a line of its own on a phone, beside the code from sm up", () => {
    renderWithHouseholdData(<ApartmentRow apt={{ ...APT, shortCode: "KTR-3B-1b-WY-8003" }} />);
    const title = document.querySelector("[data-row-title]")!;
    expect(title).toHaveClass("flex-col", "sm:flex-row");
    expect(screen.getByRole("heading", { name: "Sonnenweg 3" })).toHaveClass("w-full", "truncate");
  });

  it("keeps the gone and not processed badges, in words", () => {
    renderWithHouseholdData(<ApartmentRow apt={{ ...APT, listingGone: true, processed: false }} />);
    const status = document.querySelector("[data-row-status]")!;
    expect(status).toHaveTextContent("Gone");
    expect(status).toHaveTextContent("Not processed");
  });
});
