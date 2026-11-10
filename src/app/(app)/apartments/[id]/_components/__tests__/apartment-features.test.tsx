import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { makeApartmentView } from "@/components/household-data/__tests__/fake-household-data";
import { setTestLocale } from "@/i18n/__tests__/test-locale";
import { ApartmentFeatures } from "../apartment-features";

afterEach(() => {
  cleanup();
  setTestLocale("en");
});

function items() {
  return Array.from(document.querySelectorAll("[data-feature]")).map((li) => [
    li.getAttribute("data-feature"),
    li.getAttribute("data-has"),
  ]);
}

// #471: the features the household knows, under the stat tiles.
describe("ApartmentFeatures", () => {
  it("lists what the apartment has, then what it lacks, and leaves the unknown out", () => {
    render(
      <ApartmentFeatures
        apartment={makeApartmentView({ id: "a1", petsAllowed: false, hasElevator: true, hasGarden: true, hasCellar: null })}
      />
    );
    expect(screen.getByRole("region", { name: "Features" })).toBeInTheDocument();
    expect(items()).toEqual([
      ["hasGarden", "true"],
      ["hasElevator", "true"],
      ["petsAllowed", "false"],
    ]);
  });

  it("says yes or no to a screen reader, not only with a tick and a strike", () => {
    render(<ApartmentFeatures apartment={makeApartmentView({ id: "a1", hasElevator: true, petsAllowed: false })} />);
    expect(screen.getByText("Elevator: yes")).toHaveClass("sr-only");
    expect(screen.getByText("Pets allowed: no")).toHaveClass("sr-only");
    expect(document.querySelector('[data-feature="petsAllowed"]')).toHaveClass("line-through");
  });

  it("shows nothing while no feature is known", () => {
    const { container } = render(<ApartmentFeatures apartment={makeApartmentView({ id: "a1" })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names them in the reader's language", () => {
    setTestLocale("de");
    render(<ApartmentFeatures apartment={makeApartmentView({ id: "a1", hasElevator: true })} />);
    expect(screen.getByRole("region", { name: "Ausstattung" })).toBeInTheDocument();
    expect(screen.getByText("Lift: ja")).toBeInTheDocument();
  });
});
