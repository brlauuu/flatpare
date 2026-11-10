import { describe, it, expect } from "vitest";
import {
  fillFromExtraction,
  INFERABLE_FIELDS,
  diffInferableFields,
  mergeUserEdit,
  applyExtraction,
} from "@/lib/edited-fields";
import { emptyApartment } from "@/lib/household-data/types";
import { emptyFeatures } from "@/lib/household-data/features";

describe("INFERABLE_FIELDS", () => {
  it("contains the expected AI-inferable apartment fields", () => {
    expect(INFERABLE_FIELDS).toEqual([
      "name",
      "address",
      "sizeM2",
      "numRooms",
      "numBathrooms",
      "numBalconies",
      "hasWashingMachine",
      "rentChf",
      "rentCurrency",
      "listingUrl",
      "summary",
      "availableFrom",
      "hasWoodenFloor",
      "hasGarden",
      "hasTerrace",
      "hasElevator",
      "hasCellar",
      "hasParking",
      "hasDishwasher",
      "petsAllowed",
    ]);
  });
});

describe("diffInferableFields", () => {
  it("returns an empty array when all values match", () => {
    const current = { name: "X", rentChf: 1500, sizeM2: 50 };
    const incoming = { name: "X", rentChf: 1500, sizeM2: 50 };
    expect(diffInferableFields(current, incoming)).toEqual([]);
  });

  it("returns the names of changed inferable fields", () => {
    const current = { name: "X", rentChf: 1500 };
    const incoming = { name: "Y", rentChf: 2000 };
    const result = diffInferableFields(current, incoming);
    expect(result.sort()).toEqual(["name", "rentChf"]);
  });

  it("ignores changes to fields outside the inferable list", () => {
    const current = { name: "X", distanceBikeMin: 5 };
    const incoming = { name: "X", distanceBikeMin: 10 };
    expect(diffInferableFields(current, incoming)).toEqual([]);
  });

  it("treats null vs non-null as a change", () => {
    const current = { rentChf: null };
    const incoming = { rentChf: 1500 };
    expect(diffInferableFields(current, incoming)).toEqual(["rentChf"]);
  });
});

describe("mergeUserEdit", () => {
  it("applies the edit and records only the fields that changed", () => {
    const current = { ...emptyApartment("X"), rentChf: 1500, rentCurrency: "CHF", userEditedFields: ["summary"] };
    const next = mergeUserEdit(current, {
      name: "X",
      address: null,
      sizeM2: null,
      numRooms: null,
      numBathrooms: null,
      numBalconies: null,
      hasWashingMachine: true,
      rentChf: 1600,
      rentCurrency: "CHF",
      listingUrl: null,
      summary: null,
      availableFrom: null,
      ...emptyFeatures(),
    });
    expect(next.rentChf).toBe(1600);
    expect(next.hasWashingMachine).toBe(true);
    expect(next.userEditedFields.sort()).toEqual(["hasWashingMachine", "rentChf", "summary"]);
    // Non-inferable state is carried over untouched.
    expect(next.userEditedFields).not.toContain("distances");
    expect(next.pdf).toBeNull();
  });

  it("does not duplicate a field already marked as edited", () => {
    const current = { ...emptyApartment("X"), userEditedFields: ["name"] };
    const next = mergeUserEdit(current, { ...current, name: "Y" });
    expect(next.userEditedFields).toEqual(["name"]);
  });
});

describe("applyExtraction", () => {
  it("overwrites inferable fields the user has not edited and keeps the edited ones", () => {
    const current = {
      ...emptyApartment("Old name"),
      rentChf: 1500,
      summary: "my own words",
      userEditedFields: ["summary"],
    };
    const raw = { name: "New name", rentChf: 1700, summary: "AI words" };
    const next = applyExtraction(
      current,
      { ...current, name: "New name", rentChf: 1700, summary: "AI words" },
      raw
    );
    expect(next.name).toBe("New name");
    expect(next.rentChf).toBe(1700);
    expect(next.summary).toBe("my own words");
    expect(next.rawExtractedData).toEqual(raw);
    expect(next.userEditedFields).toEqual(["summary"]);
  });
});

// #413: a PDF never overwrites what a member already entered.
describe("fillFromExtraction", () => {
  it("fills only empty fields and protects the ones already filled", () => {
    const current = {
      ...emptyApartment("Our name"),
      address: "Typed 1",
      rentChf: null,
      summary: "  ",
    };
    const incoming = {
      name: "PDF name",
      address: "PDF 2",
      sizeM2: 70,
      numRooms: 3,
      numBathrooms: 1,
      numBalconies: 0,
      hasWashingMachine: true,
      rentChf: 2100,
      rentCurrency: "EUR",
      listingUrl: "https://example.com/x",
      summary: "From the PDF",
      availableFrom: "2026-12-01",
      ...emptyFeatures(),
    };
    const next = fillFromExtraction(current, incoming, { raw: true });
    expect(next).toMatchObject({
      name: "Our name",
      address: "Typed 1",
      sizeM2: 70,
      rentChf: 2100,
      summary: "From the PDF",
      rawExtractedData: { raw: true },
    });
    expect(next.userEditedFields.sort()).toEqual(["address", "name"]);
    // A later reprocess keeps them too.
    expect(applyExtraction(next, incoming, {})).toMatchObject({ name: "Our name", address: "Typed 1" });
  });
});

// #427: the rent and its currency are one value.
describe("the rent and its currency", () => {
  const pdf = {
    name: "x", address: null, sizeM2: null, numRooms: null, numBathrooms: null, numBalconies: null,
    hasWashingMachine: null, rentChf: 1800, rentCurrency: "EUR", listingUrl: null, summary: null, availableFrom: null,
    ...emptyFeatures(),
  };

  it("a reprocess keeps both when a member edited either", () => {
    for (const edited of ["rentChf", "rentCurrency"]) {
      const current = { ...emptyApartment("x"), rentChf: 2400, rentCurrency: "CHF", userEditedFields: [edited] };
      const next = applyExtraction(current, pdf, {});
      expect([next.rentChf, next.rentCurrency], edited).toEqual([2400, "CHF"]);
    }
  });

  it("a reprocess replaces both when neither was edited", () => {
    const current = { ...emptyApartment("x"), rentChf: 2400, rentCurrency: "CHF" };
    const next = applyExtraction(current, pdf, {});
    expect([next.rentChf, next.rentCurrency]).toEqual([1800, "EUR"]);
  });

  it("a first read fills both when the rent is empty, and neither when it is not", () => {
    const empty = fillFromExtraction({ ...emptyApartment("x"), rentCurrency: "CHF" }, pdf, {});
    expect([empty.rentChf, empty.rentCurrency]).toEqual([1800, "EUR"]);
    const typed = fillFromExtraction({ ...emptyApartment("x"), rentChf: 2400, rentCurrency: "CHF" }, pdf, {});
    expect([typed.rentChf, typed.rentCurrency]).toEqual([2400, "CHF"]);
    expect(typed.userEditedFields).toEqual(expect.arrayContaining(["rentChf", "rentCurrency"]));
  });
});

// #412: an apartment made from a link is named after the site until a PDF
// says what it is.
describe("a name taken from the link's site", () => {
  const link = "https://www.homegate.ch/rent/4001234567";
  const pdf = {
    name: "3.5 rooms in Wiedikon", address: null, sizeM2: null, numRooms: null, numBathrooms: null,
    numBalconies: null, hasWashingMachine: null, rentChf: null, rentCurrency: null, listingUrl: null,
    summary: null, availableFrom: null, ...emptyFeatures(),
  };
  const fromLink = { ...emptyApartment("www.homegate.ch"), listingUrl: link };

  it("is replaced by the first read and not marked as kept", () => {
    const next = fillFromExtraction(fromLink, pdf, {});
    expect(next.name).toBe("3.5 rooms in Wiedikon");
    expect(next.userEditedFields).not.toContain("name");
  });

  it("is replaced by a reprocess, also where an earlier read marked it as kept", () => {
    const marked = { ...fromLink, userEditedFields: ["name", "address"] };
    const next = applyExtraction(marked, pdf, {});
    expect(next.name).toBe("3.5 rooms in Wiedikon");
    expect(next.userEditedFields).toEqual(["address"]);
  });

  it("stays when the PDF names nothing, and a name a member chose is never replaced", () => {
    expect(fillFromExtraction(fromLink, { ...pdf, name: "" }, {}).name).toBe("www.homegate.ch");
    const chosen = { ...fromLink, name: "The one near the lake", userEditedFields: ["name"] };
    expect(applyExtraction(chosen, pdf, {}).name).toBe("The one near the lake");
    expect(fillFromExtraction(chosen, pdf, {}).name).toBe("The one near the lake");
  });
});

// #471: each feature is its own field, so one answer kept does not keep them all.
describe("the features", () => {
  const pdf = {
    name: "x", address: null, sizeM2: null, numRooms: null, numBathrooms: null, numBalconies: null,
    hasWashingMachine: null, rentChf: null, rentCurrency: null, listingUrl: null, summary: null, availableFrom: null,
    ...emptyFeatures(),
    hasElevator: false,
    hasGarden: true,
  };

  it("a member's answer on one survives a reprocess, and the PDF fills the others", () => {
    const edited = mergeUserEdit(emptyApartment("x"), { ...pdf, hasGarden: null, hasElevator: true });
    expect(edited.userEditedFields).toEqual(["hasElevator"]);
    const next = applyExtraction(edited, pdf, {});
    expect(next.hasElevator).toBe(true);
    expect(next.hasGarden).toBe(true);
  });

  it("a first read fills only the features nobody answered", () => {
    const next = fillFromExtraction({ ...emptyApartment("x"), hasElevator: true }, pdf, {});
    expect(next.hasElevator).toBe(true);
    expect(next.hasGarden).toBe(true);
    expect(next.userEditedFields).toContain("hasElevator");
    expect(next.userEditedFields).not.toContain("hasGarden");
  });

  it("a known 'no' is an answer, kept like a 'yes'", () => {
    const next = fillFromExtraction({ ...emptyApartment("x"), hasGarden: false }, pdf, {});
    expect(next.hasGarden).toBe(false);
  });
});
