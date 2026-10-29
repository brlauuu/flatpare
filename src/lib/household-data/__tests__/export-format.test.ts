import { describe, it, expect } from "vitest";
import {
  buildExportFiles,
  EXPORT_FORMAT,
  ExportFormatError,
  parseExportFiles,
  planImport,
  type ExportFiles,
  type ExportInput,
  type ParsedExport,
  type RatingLine,
} from "../export-format";
import {
  emptyApartment,
  EMPTY_RATING,
  type DecodedApartment,
  type DecodedLocation,
  type DecodedRating,
} from "../types";

const A1 = "a1";
const A2 = "a2";
const L1 = "l1";
const L2 = "l2";
const PDF = new Uint8Array([37, 80, 68, 70]);

function apartment(id: string, name: string, over: Partial<DecodedApartment["data"]> = {}): DecodedApartment {
  return {
    id,
    version: 2,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    data: { ...emptyApartment(name), ...over },
  };
}

function rating(apartmentId: string, userId: string, userName: string, over: Partial<typeof EMPTY_RATING> = {}): DecodedRating {
  return { apartmentId, userId, userName, updatedAt: "2026-10-03T00:00:00.000Z", data: { ...EMPTY_RATING, ...over } };
}

function location(id: string, sortOrder: number, label: string): DecodedLocation {
  return { id, sortOrder, data: { label, icon: "Train", address: `${label} street 1`, latitude: 47.5, longitude: 7.6 } };
}

function input(over: Partial<ExportInput> = {}): ExportInput {
  return {
    apartments: [
      apartment(A1, "Sunny flat", {
        address: "Main street 1",
        rentChf: 2100,
        latitude: 47.55,
        longitude: 7.59,
        shortCode: "3R1B",
        distances: { [L1]: { bikeMin: 12, transitMin: 20 }, [L2]: { bikeMin: 5, transitMin: null } },
        pdf: { path: "/api/uploads/households/5/a1.pdf.enc", iv: "iv" },
      }),
      apartment(A2, "Dark flat"),
    ],
    ratings: [
      rating(A1, "u-me", "Me", { overallFeeling: 4, kitchen: 3, comment: "Nice light" }),
      rating(A1, "u-lena", "Lena", { overallFeeling: 2, comment: "Too loud" }),
    ],
    locations: [location(L2, 1, "Gym"), location(L1, 0, "Work")],
    pdfs: new Map([[A1, PDF]]),
    missingPdfs: 0,
    exportedAt: new Date("2026-10-24T10:00:00.000Z"),
    appVersion: "0.17.0",
    ...over,
  };
}

const text = (files: ExportFiles, name: string) => new TextDecoder().decode(files[name]);
const read = (files: ExportFiles, name: string) => JSON.parse(text(files, name));

describe("buildExportFiles", () => {
  it("writes the manifest, the three tables, a CSV and the PDFs", () => {
    const files = buildExportFiles(input());
    expect(Object.keys(files).sort()).toEqual([
      "apartments.csv",
      "apartments.json",
      "locations.json",
      "manifest.json",
      "pdfs/a1.pdf",
      "ratings.json",
    ]);
    expect(read(files, "manifest.json")).toEqual({
      format: EXPORT_FORMAT,
      version: 1,
      exportedAt: "2026-10-24T10:00:00.000Z",
      appVersion: "0.17.0",
      counts: { apartments: 2, ratings: 2, locations: 2, pdfs: 1 },
      skipped: { apartments: 0, ratings: 0, locations: 0, pdfs: 0 },
    });
    expect(files["pdfs/a1.pdf"]).toEqual(PDF);
    const apartments = read(files, "apartments.json");
    // The stored-file reference and iv are this instance's business; the
    // file names the PDF inside the ZIP instead.
    expect(apartments[0].data.pdf).toBe("pdfs/a1.pdf");
    expect(apartments[1].data.pdf).toBeNull();
    expect(read(files, "ratings.json")[1]).toMatchObject({ userId: "u-lena", userName: "Lena" });
  });

  it("leaves out rows that could not be decrypted and counts them", () => {
    const files = buildExportFiles(
      input({
        apartments: [...input().apartments, { ...apartment("bad", "x"), data: null }],
        ratings: [...input().ratings, { ...rating(A2, "u-x", "X"), data: null }],
        locations: [...input().locations, { id: "l-bad", sortOrder: 3, data: null }],
        missingPdfs: 1,
      })
    );
    expect(read(files, "manifest.json").skipped).toEqual({ apartments: 1, ratings: 1, locations: 1, pdfs: 1 });
    expect(read(files, "apartments.json")).toHaveLength(2);
    expect(read(files, "ratings.json")).toHaveLength(2);
    expect(read(files, "locations.json")).toHaveLength(2);
  });

  it("marks an apartment whose PDF could not be read as having none", () => {
    const files = buildExportFiles(input({ pdfs: new Map(), missingPdfs: 1 }));
    expect(read(files, "apartments.json")[0].data.pdf).toBeNull();
    expect(files["pdfs/a1.pdf"]).toBeUndefined();
  });

  it("writes a CSV a spreadsheet opens safely", () => {
    const files = buildExportFiles(
      input({ apartments: [apartment(A1, '=HYPERLINK("x"), "quoted"', { address: "Line 1\nLine 2" })], ratings: [] })
    );
    const lines = text(files, "apartments.csv").split("\r\n");
    expect(lines[0]).toMatch(/^id,name,address,rent,rentCurrency,/);
    // Formula start neutralised, quotes doubled, newline kept inside quotes.
    expect(lines[1]).toContain(`"'=HYPERLINK(""x""), ""quoted"""`);
    expect(text(files, "apartments.csv")).toContain('"Line 1\nLine 2"');
  });

  it("puts the averages and rating count in the CSV", () => {
    const csv = text(buildExportFiles(input()), "apartments.csv").split("\r\n");
    const header = csv[0].split(",");
    const row = csv[1].split(",");
    expect(row[header.indexOf("ratings")]).toBe("2");
    expect(row[header.indexOf("avgOverall")]).toBe("3");
  });
});

describe("parseExportFiles", () => {
  it("reads back what buildExportFiles wrote", () => {
    const parsed = parseExportFiles(buildExportFiles(input()));
    expect(parsed.manifest.counts.apartments).toBe(2);
    expect(parsed.apartments[0].data.name).toBe("Sunny flat");
    expect(parsed.apartments[0].data.pdf).toBeNull();
    expect(parsed.apartments[0].pdf).toEqual(PDF);
    expect(parsed.apartments[1].pdf).toBeNull();
    expect(parsed.ratings).toHaveLength(2);
    expect(parsed.locations.map((l) => l.data.label).sort()).toEqual(["Gym", "Work"]);
  });

  function problem(files: ExportFiles): string {
    try {
      parseExportFiles(files);
    } catch (err) {
      expect(err).toBeInstanceOf(ExportFormatError);
      return (err as ExportFormatError).problem;
    }
    throw new Error("expected a refusal");
  }

  const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

  it("refuses a ZIP without a manifest, or with another format's", () => {
    expect(problem({ "readme.txt": new Uint8Array([1]) })).toBe("not-export");
    expect(problem({ "manifest.json": enc({ format: "something-else" }) })).toBe("not-export");
  });

  it("refuses an export from a newer format version", () => {
    const files = buildExportFiles(input());
    files["manifest.json"] = enc({ ...read(files, "manifest.json"), version: 2 });
    expect(problem(files)).toBe("newer-version");
  });

  it("refuses a damaged export", () => {
    const missing = buildExportFiles(input());
    delete missing["ratings.json"];
    expect(problem(missing)).toBe("invalid");

    const notJson = buildExportFiles(input());
    notJson["locations.json"] = new TextEncoder().encode("{");
    expect(problem(notJson)).toBe("invalid");

    const badRow = buildExportFiles(input());
    badRow["apartments.json"] = enc([{ id: A1, data: { name: 3 } }]);
    expect(problem(badRow)).toBe("invalid");

    const badPdf = buildExportFiles(input());
    const rows = read(badPdf, "apartments.json");
    rows[0].data.pdf = 7;
    badPdf["apartments.json"] = enc(rows);
    expect(problem(badPdf)).toBe("invalid");

    const badScore = buildExportFiles(input());
    const ratings = read(badScore, "ratings.json");
    ratings[0].data.kitchen = 9;
    badScore["ratings.json"] = enc(ratings);
    expect(problem(badScore)).toBe("invalid");
  });
});

describe("planImport", () => {
  let n = 0;
  const newId = () => `new-${++n}`;
  const line: RatingLine = ({ userName, data }) => `Rated by ${userName}: ${data.overallFeeling}/5 ${data.comment}`.trim();
  const parsed = (): ParsedExport => parseExportFiles(buildExportFiles(input()));

  it("gives every row a new id and keeps locations in their order", () => {
    n = 0;
    const plan = planImport(parsed(), "u-me", newId, line);
    expect(plan.locations.map((l) => l.data.label)).toEqual(["Work", "Gym"]);
    expect(plan.locations.map((l) => l.id)).toEqual(["new-1", "new-2"]);
    expect(plan.apartments.map((a) => a.id)).toEqual(["new-3", "new-4"]);
  });

  it("carries coordinates, short codes and distances over, keyed by the new location ids", () => {
    n = 0;
    const plan = planImport(parsed(), "u-me", newId, line);
    const sunny = plan.apartments[0];
    expect(sunny.data).toMatchObject({ latitude: 47.55, longitude: 7.59, shortCode: "3R1B", pdf: null });
    expect(sunny.data.distances).toEqual({
      "new-1": { bikeMin: 12, transitMin: 20 },
      "new-2": { bikeMin: 5, transitMin: null },
    });
    expect(sunny.pdf).toEqual(PDF);
  });

  it("drops a distance to a location the file does not hold", () => {
    const p = parsed();
    p.locations = p.locations.filter((l) => l.id === L1);
    n = 0;
    const plan = planImport(p, "u-me", newId, line);
    expect(Object.keys(plan.apartments[0].data.distances)).toEqual(["new-1"]);
  });

  it("restores the importer's own rating and adds everyone else's as text", () => {
    n = 0;
    const plan = planImport(parsed(), "u-me", newId, line);
    expect(plan.ratings).toEqual([
      {
        apartmentId: "new-3",
        data: { ...EMPTY_RATING, overallFeeling: 4, kitchen: 3, comment: "Nice light\n\nRated by Lena: 2/5 Too loud" },
      },
    ]);
  });

  it("writes an unrated rating holding only the text when the importer had not rated", () => {
    n = 0;
    const plan = planImport(parsed(), "someone-new", newId, line);
    expect(plan.ratings).toEqual([
      {
        apartmentId: "new-3",
        data: { ...EMPTY_RATING, comment: "Rated by Me: 4/5 Nice light\n\nRated by Lena: 2/5 Too loud" },
      },
    ]);
  });
});
