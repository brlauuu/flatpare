import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { makeApartmentView } from "@/components/household-data/__tests__/fake-household-data";
import { setTestLocale } from "@/i18n/__tests__/test-locale";
import { ApartmentStatTiles } from "../apartment-stat-tiles";

afterEach(() => {
  cleanup();
  setTestLocale("en");
});

function tiles() {
  return Array.from(document.querySelectorAll("[data-stat-tile]")).map((tile) => [
    tile.children[0].textContent,
    tile.children[1].textContent,
  ]);
}

// #452: the facts as tiles, the value large and its label under it.
describe("ApartmentStatTiles", () => {
  it("shows every fact as a value over its label", () => {
    const apt = makeApartmentView({
      id: "a1",
      rentChf: 2450,
      rentCurrency: "CHF",
      sizeM2: 78,
      numRooms: 3.5,
      numBathrooms: 1,
      numBalconies: 2,
      hasWashingMachine: true,
    });
    render(<ApartmentStatTiles apartment={apt} />);
    const shown = tiles();
    expect(shown.map(([, label]) => label)).toEqual([
      "Rent per month",
      "Size",
      "Rooms",
      "Bathrooms",
      "Balconies",
      "Washing machine",
    ]);
    expect(shown[0][0]).toMatch(/CHF/);
    expect(shown[0][0]).toMatch(/2.?450/);
    expect(shown.slice(1).map(([value]) => value)).toEqual(["78 m²", "3.5", "1", "2", "Yes"]);
    expect(screen.getByTitle("Washing machine: yes")).toBeInTheDocument();
  });

  it("formats the rent in its own currency", () => {
    render(<ApartmentStatTiles apartment={makeApartmentView({ id: "a1", rentChf: 1200, rentCurrency: "EUR" })} />);
    expect(tiles()[0][0]).toMatch(/EUR|€/);
  });

  it("leaves out what is missing, and shows ? for an unknown washing machine", () => {
    const apt = makeApartmentView({
      id: "a1",
      rentChf: null,
      sizeM2: null,
      numRooms: null,
      numBathrooms: null,
      numBalconies: null,
      hasWashingMachine: null,
    });
    render(<ApartmentStatTiles apartment={apt} />);
    expect(tiles()).toEqual([["?", "Washing machine"]]);
    expect(screen.getByTitle("Washing machine: unknown")).toBeInTheDocument();
  });

  it("says no, or shared, when there is no machine of its own", () => {
    render(<ApartmentStatTiles apartment={makeApartmentView({ id: "a1", hasWashingMachine: false })} />);
    expect(screen.getByTitle("Washing machine: no (or shared)")).toHaveTextContent("No");
  });

  it("labels and formats in the reader's language", () => {
    setTestLocale("fr");
    render(<ApartmentStatTiles apartment={makeApartmentView({ id: "a1", numRooms: 3.5, numBathrooms: 2, hasWashingMachine: true })} />);
    expect(tiles()).toContainEqual(["3,5", "Pièces"]);
    expect(tiles()).toContainEqual(["Oui", "Lave-linge"]);
  });
});
