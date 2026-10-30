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

// #451: the states are icons; the words are the hover title and the
// screen-reader text, never shown on the tile.
describe("ApartmentCard status icons", () => {
  function icon(label: string) {
    const el = screen.getByTitle(label);
    expect(el).toHaveTextContent(label);
    expect(el.querySelector(".sr-only")).toHaveTextContent(label);
    return el;
  }

  it("marks an apartment I rated with the filled check", () => {
    renderWithHouseholdData(<ApartmentCard apt={{ ...APT, myRating: 4 }} />);
    expect(icon("Rated").querySelector("[data-rated]")).toHaveClass("bg-success", "rounded-full");
    expect(screen.queryByTitle("Not yet rated")).toBeNull();
  });

  it("marks one I have not rated with the empty circle", () => {
    renderWithHouseholdData(<ApartmentCard apt={{ ...APT, myRating: null }} />);
    expect(icon("Not yet rated").querySelector("[data-rated]")).toBeNull();
    expect(screen.queryByTitle("Rated")).toBeNull();
  });

  it("shows gone and not processed as icons only when they apply", () => {
    renderWithHouseholdData(<ApartmentCard apt={{ ...APT, listingGone: true, processed: false }} />);
    icon("Gone");
    icon("Not processed");
    cleanup();
    renderWithHouseholdData(<ApartmentCard apt={{ ...APT, listingGone: false, processed: true }} />);
    expect(screen.queryByTitle("Gone")).toBeNull();
    expect(screen.queryByTitle("Not processed")).toBeNull();
  });

  it("holds every word inside a screen-reader-only span", () => {
    renderWithHouseholdData(<ApartmentCard apt={{ ...APT, listingGone: true, processed: false }} />);
    for (const el of document.querySelectorAll("[data-card-badges] [title]")) {
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) expect(node.textContent?.trim()).toBe("");
      }
    }
  });

  // The delete button's offset is the margin the padding leaves, so the two
  // move together.
  it("has no card padding, and the delete button sits at the content's corner", () => {
    renderWithHouseholdData(<ApartmentCard apt={APT} />);
    expect(document.querySelector("[data-slot='card']")).toHaveClass("py-0");
    expect(document.querySelector("[data-slot='card-content']")).toHaveClass("p-4");
    expect(screen.getByRole("button", { name: "Delete Sonnenweg 3" })).toHaveClass("top-[19px]", "right-[19px]");
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
