import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  renderWithHouseholdData,
  makeApartmentView,
} from "@/components/household-data/__tests__/fake-household-data";
import { ApartmentCard } from "../apartment-card";

const APT = makeApartmentView({ id: "a1", name: "Sonnenweg 3" });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// #437: delete straight from the card, after a confirmation.
describe("ApartmentCard quick delete", () => {
  it("names the apartment, and sits beside the link rather than inside it", () => {
    renderWithHouseholdData(<ApartmentCard apt={APT} />);
    const button = screen.getByRole("button", { name: "Delete Sonnenweg 3" });
    expect(button.closest("a")).toBeNull();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/apartments/a1");
  });

  it("deletes the apartment once confirmed", async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<ApartmentCard apt={APT} />);
    await user.click(screen.getByRole("button", { name: "Delete Sonnenweg 3" }));
    expect(confirm).toHaveBeenCalledWith('Delete "Sonnenweg 3"? This cannot be undone.');
    await waitFor(() => expect(value.deleteApartment).toHaveBeenCalledWith("a1"));
  });

  it("deletes nothing when the confirmation is declined", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<ApartmentCard apt={APT} />);
    await user.click(screen.getByRole("button", { name: "Delete Sonnenweg 3" }));
    expect(value.deleteApartment).not.toHaveBeenCalled();
  });

  it("says so when the delete fails, and offers the button again", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<ApartmentCard apt={APT} />);
    vi.mocked(value.deleteApartment).mockRejectedValueOnce(new Error("Network error"));
    await user.click(screen.getByRole("button", { name: "Delete Sonnenweg 3" }));
    expect(await screen.findByRole("alert")).toHaveTextContent('Couldn\'t delete "Sonnenweg 3". Try again.');
    expect(screen.getByRole("button", { name: "Delete Sonnenweg 3" })).toBeEnabled();
  });
});

// #451: the ratings as a star and numbers, the states as icons; the words are
// the hover title and the screen-reader text, never shown on the tile.
describe("ApartmentCard ratings and status icons", () => {
  function summary() {
    return document.querySelector("[data-card-top] [data-rating-summary]")!;
  }

  it("shows everyone's average and mine in parentheses", () => {
    renderWithHouseholdData(<ApartmentCard apt={{ ...APT, avgOverall: 4.25, myRating: 5 }} />);
    expect(summary()).toHaveTextContent("4.3 (5)");
    expect(summary()).toHaveAttribute("title", "Average 4.3 of 5, your rating 5");
    expect(summary().querySelector(".sr-only")).toHaveTextContent("Average 4.3 of 5, your rating 5");
  });

  it("shows the same number twice when only I rated it", () => {
    renderWithHouseholdData(<ApartmentCard apt={{ ...APT, avgOverall: 4, myRating: 4 }} />);
    expect(summary()).toHaveTextContent("4.0 (4)");
  });

  it("shows a dash for mine when others rated it and I have not", () => {
    renderWithHouseholdData(<ApartmentCard apt={{ ...APT, avgOverall: 3.5, myRating: null }} />);
    expect(summary()).toHaveTextContent("3.5 (–)");
    expect(summary()).toHaveAttribute("title", "Average 3.5 of 5, you have not rated it");
  });

  it("shows a dash alone before anyone rated it", () => {
    renderWithHouseholdData(<ApartmentCard apt={{ ...APT, avgOverall: null, myRating: null }} />);
    expect(summary()).toHaveTextContent("–");
    expect(summary()).toHaveAttribute("title", "No ratings yet");
  });

  it("has no rated badge and no row of stars beside the title any more", () => {
    renderWithHouseholdData(<ApartmentCard apt={{ ...APT, avgOverall: 4, myRating: 4 }} />);
    expect(screen.queryByTitle("Rated")).toBeNull();
    expect(screen.queryByText("Rated")).toBeNull();
    // One star on the tile: the summary's.
    expect(document.querySelectorAll("[data-slot='card'] svg.lucide-star")).toHaveLength(1);
    expect(summary().querySelector("svg.lucide-star")).not.toBeNull();
  });

  it("shows gone and not processed as icons only when they apply", () => {
    renderWithHouseholdData(<ApartmentCard apt={{ ...APT, listingGone: true, processed: false }} />);
    for (const label of ["Gone", "Not processed"]) {
      const el = screen.getByTitle(label);
      expect(el.querySelector(".sr-only")).toHaveTextContent(label);
    }
    cleanup();
    renderWithHouseholdData(<ApartmentCard apt={{ ...APT, listingGone: false, processed: true }} />);
    expect(screen.queryByTitle("Gone")).toBeNull();
    expect(screen.queryByTitle("Not processed")).toBeNull();
  });

  it("holds every word inside a screen-reader-only span", () => {
    renderWithHouseholdData(<ApartmentCard apt={{ ...APT, listingGone: true, processed: false }} />);
    for (const el of document.querySelectorAll("[data-card-status] [title]:not([data-rating-summary])")) {
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) expect(node.textContent?.trim()).toBe("");
      }
    }
  });

  it("puts the code, the ratings and the status icons on the first line", () => {
    renderWithHouseholdData(
      <ApartmentCard apt={{ ...APT, shortCode: "KTR-3B-1b-WY-8003", avgOverall: 4, myRating: 4, processed: false }} />
    );
    const top = document.querySelector("[data-card-top]")!;
    expect(top.querySelector("[data-card-code]")).toHaveTextContent("KTR-3B-1b-WY-8003");
    expect(top.querySelector("[data-card-status]")).toContainElement(screen.getByTitle("Not processed"));
    expect(top).toContainElement(summary() as HTMLElement);
  });

  // The delete button's offset is the margin the padding leaves, so the two
  // move together; the facts are held clear of it and line up with it.
  it("has no card padding, and the delete button sits in the corner beside the facts", () => {
    renderWithHouseholdData(<ApartmentCard apt={APT} />);
    expect(document.querySelector("[data-slot='card']")).toHaveClass("py-0");
    expect(document.querySelector("[data-slot='card-content']")).toHaveClass("p-4");
    expect(screen.getByRole("button", { name: "Delete Sonnenweg 3" })).toHaveClass(
      "bottom-[19px]", "right-[19px]", "h-11", "sm:h-8"
    );
    expect(document.querySelector("[data-card-facts]")).toHaveClass("pr-12", "sm:pr-9", "min-h-11", "sm:min-h-8");
  });

  it("shows the facts a step larger than a badge", () => {
    renderWithHouseholdData(
      <ApartmentCard apt={{ ...APT, rentChf: 2200, rentCurrency: "CHF", sizeM2: 60, numRooms: 2.5 }} />
    );
    const facts = document.querySelectorAll("[data-card-facts] [data-slot='badge']");
    expect(facts).toHaveLength(3);
    for (const fact of facts) expect(fact).toHaveClass("text-sm", "h-7");
  });
});
