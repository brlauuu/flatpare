import { describe, it, expect } from "vitest";
import {
  INFERABLE_FIELDS,
  diffInferableFields,
  mergeUserEdit,
  applyExtraction,
} from "@/lib/edited-fields";
import { emptyApartment } from "@/lib/household-data/types";

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
      "listingUrl",
      "summary",
      "availableFrom",
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
    const current = { ...emptyApartment("X"), rentChf: 1500, userEditedFields: ["summary"] };
    const next = mergeUserEdit(current, {
      name: "X",
      address: null,
      sizeM2: null,
      numRooms: null,
      numBathrooms: null,
      numBalconies: null,
      hasWashingMachine: true,
      rentChf: 1600,
      listingUrl: null,
      summary: null,
      availableFrom: null,
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
