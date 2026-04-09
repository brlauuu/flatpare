import {
  appendApartmentAndEmptyScores,
  createApartmentFromInput,
  emptyScoreRecord,
  migrateLegacyScores,
  normalizeScoresByApartmentCount
} from "./domain";
import type { Apartment, ScoresByUser } from "../types";

describe("domain helpers", () => {
  it("migrates legacy score rows and maps usernote to note", () => {
    const migrated = migrateLegacyScores([
      {
        kitchen: 4,
        balcony: 3,
        floorplan: 5,
        light: 2,
        feel: 5,
        usernote: "Strong vibe"
      }
    ]);

    expect(migrated[0]).toEqual({
      kitchen: 4,
      balcony: 3,
      floorplan: 5,
      light: 2,
      feel: 5,
      note: "Strong vibe"
    });
  });

  it("pads missing score rows to match apartment count", () => {
    const apartments: Apartment[] = [
      createApartmentFromInput({ addr: "A Street 1" }),
      createApartmentFromInput({ addr: "B Street 2" })
    ];

    const scores: ScoresByUser = {
      djordje: [emptyScoreRecord()],
      lara: []
    };

    const normalized = normalizeScoresByApartmentCount(apartments, scores);

    expect(normalized.djordje).toHaveLength(2);
    expect(normalized.lara).toHaveLength(2);
  });

  it("appends apartment and empty records for both users", () => {
    const apartment = createApartmentFromInput({ addr: "Main St 9" });
    const result = appendApartmentAndEmptyScores(
      [],
      { djordje: [], lara: [] },
      apartment
    );

    expect(result.apartments).toHaveLength(1);
    expect(result.scoresByUser.djordje).toHaveLength(1);
    expect(result.scoresByUser.lara).toHaveLength(1);
    expect(result.newIndex).toBe(0);
  });
});
