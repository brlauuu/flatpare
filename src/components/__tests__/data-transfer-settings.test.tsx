import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTransferSettings } from "../data-transfer-settings";
import {
  makeApartmentView,
  makeLocationView,
  renderWithHouseholdData,
} from "@/components/household-data/__tests__/fake-household-data";
import { ExportFormatError, type ParsedExport, type RatingLine } from "@/lib/household-data/export-format";
import { emptyApartment, EMPTY_RATING } from "@/lib/household-data/types";
import { setTestLocale } from "@/i18n/__tests__/test-locale";

function parsedExport(apartments = 2): ParsedExport {
  return {
    manifest: {
      format: "flatpare-export",
      version: 1,
      exportedAt: "2026-10-20T10:00:00.000Z",
      appVersion: "0.17.0",
      counts: { apartments, ratings: 1, locations: 1, pdfs: 0 },
      skipped: { apartments: 0, ratings: 0, locations: 0, pdfs: 0 },
    },
    apartments: Array.from({ length: apartments }, (_, i) => ({
      id: `a${i}`,
      data: emptyApartment(`Flat ${i}`),
      pdf: null,
    })),
    ratings: [{ apartmentId: "a0", userId: "u-lena", userName: "Lena", data: EMPTY_RATING }],
    locations: [{ id: "l1", sortOrder: 0, data: { label: "Work", icon: "Train", address: "x", latitude: null, longitude: null } }],
  };
}

const zipFile = () => new File(["zip"], "flatpare-export.zip", { type: "application/zip" });

beforeEach(() => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setTestLocale("en");
});

describe("DataTransferSettings: export", () => {
  it("downloads the file and says so", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<DataTransferSettings />);
    expect(screen.getByText(/The file is not encrypted/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Exported.");
    expect(value.exportHousehold).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });

  it("says when PDFs are missing from the file", async () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const user = userEvent.setup();
    renderWithHouseholdData(<DataTransferSettings />, {
      exportHousehold: vi.fn(async () => ({ blob: new Blob(), fileName: "f.zip", missingPdfs: 2 })),
    });
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(await screen.findByRole("status")).toHaveTextContent("2 PDFs could not be read and are not in the file");
  });

  it("says when the export failed", async () => {
    const user = userEvent.setup();
    renderWithHouseholdData(<DataTransferSettings />, {
      exportHousehold: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(await screen.findByRole("status")).toHaveTextContent("The export could not be made");
  });
});

describe("DataTransferSettings: import", () => {
  it("is not offered once the household has apartments or locations", () => {
    const { unmount } = renderWithHouseholdData(<DataTransferSettings />, { apartments: [makeApartmentView({ id: "a1" })] });
    expect(screen.queryByText("Choose an export file")).not.toBeInTheDocument();
    unmount();
    renderWithHouseholdData(<DataTransferSettings />, { locations: [makeLocationView({ id: "l1" })] });
    expect(screen.queryByText("Choose an export file")).not.toBeInTheDocument();
  });

  it("summarises the file, imports it and reports what landed and what did not", async () => {
    const user = userEvent.setup();
    const parsed = parsedExport();
    const { value } = renderWithHouseholdData(<DataTransferSettings />, {
      readImport: vi.fn(async () => parsed),
      importHousehold: vi.fn(async (_p, _line, onProgress) => {
        onProgress?.(1, 3);
        return {
          locations: 1,
          apartments: 1,
          pdfs: 0,
          ratings: 1,
          failed: [{ kind: "apartment" as const, name: "Flat 1", reason: "No apartment credits left" }],
        };
      }),
    });

    await user.upload(screen.getByLabelText("Choose an export file"), zipFile());
    expect(
      await screen.findByText("This file holds 2 apartments, 1 location and 1 rating, exported on Oct 20, 2026.")
    ).toBeInTheDocument();
    // Billing off: nothing about credits.
    expect(screen.queryByText(/apartment credit/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Import" }));
    const report = await screen.findByRole("status");
    expect(report).toHaveTextContent("Imported 1 apartment, 1 location, 0 PDFs and 1 rating.");
    expect(report).toHaveTextContent("Apartment Flat 1: No apartment credits left");
    expect(value.importHousehold).toHaveBeenCalledWith(parsed, expect.any(Function), expect.any(Function));
  });

  it("puts other people's ratings into words, in the importer's language", async () => {
    const user = userEvent.setup();
    const importHousehold = vi.fn(async () => ({ locations: 0, apartments: 0, pdfs: 0, ratings: 0, failed: [] }));
    renderWithHouseholdData(<DataTransferSettings />, {
      readImport: vi.fn(async () => parsedExport()),
      importHousehold,
    });
    await user.upload(screen.getByLabelText("Choose an export file"), zipFile());
    await user.click(await screen.findByRole("button", { name: "Import" }));
    await waitFor(() => expect(importHousehold).toHaveBeenCalled());
    const line = (importHousehold.mock.calls[0] as unknown as [ParsedExport, RatingLine])[1];

    expect(line({ userName: "Lena", data: { ...EMPTY_RATING, overallFeeling: 4, kitchen: 3 } })).toBe(
      "Rated by Lena: overall feeling 4/5, kitchen 3/5, balconies not rated, location not rated, floorplan not rated"
    );
    expect(line({ userName: "Lena", data: { ...EMPTY_RATING, overallFeeling: 2, comment: " Too loud " } })).toBe(
      'Rated by Lena: overall feeling 2/5, kitchen not rated, balconies not rated, location not rated, floorplan not rated. "Too loud"'
    );
  });

  it("writes the rating line in German for a German importer", async () => {
    setTestLocale("de");
    const user = userEvent.setup();
    const importHousehold = vi.fn(async () => ({ locations: 0, apartments: 0, pdfs: 0, ratings: 0, failed: [] }));
    renderWithHouseholdData(<DataTransferSettings />, {
      readImport: vi.fn(async () => parsedExport()),
      importHousehold,
    });
    await user.upload(screen.getByLabelText("Exportdatei wählen"), zipFile());
    await user.click(await screen.findByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(importHousehold).toHaveBeenCalled());
    const line = (importHousehold.mock.calls[0] as unknown as [ParsedExport, RatingLine])[1];
    expect(line({ userName: "Lena", data: { ...EMPTY_RATING, overallFeeling: 5 } })).toMatch(/^Bewertet von Lena: Gesamteindruck 5\/5/);
  });

  it.each([
    ["not-export", "This is not a Flatpare export."],
    ["newer-version", "This export was made by a newer version of Flatpare."],
    ["invalid", "This export is damaged and cannot be read."],
  ] as const)("explains a %s file", async (problem, message) => {
    const user = userEvent.setup();
    renderWithHouseholdData(<DataTransferSettings />, {
      readImport: vi.fn(async () => {
        throw new ExportFormatError(problem);
      }),
    });
    await user.upload(screen.getByLabelText("Choose an export file"), zipFile());
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("says how many credits it uses when billing is on", async () => {
    const user = userEvent.setup();
    renderWithHouseholdData(<DataTransferSettings />, {
      credits: { granted: 40, used: 0, remaining: 40 },
      readImport: vi.fn(async () => parsedExport()),
    });
    await user.upload(screen.getByLabelText("Choose an export file"), zipFile());
    expect(await screen.findByText("Importing uses 2 apartment credits.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
  });

  it("refuses up front when the household has too few credits", async () => {
    const user = userEvent.setup();
    renderWithHouseholdData(<DataTransferSettings />, {
      credits: { granted: 40, used: 39, remaining: 1 },
      readImport: vi.fn(async () => parsedExport()),
    });
    await user.upload(screen.getByLabelText("Choose an export file"), zipFile());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This would add 2 apartments, but the household has 1 credit left."
    );
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("refuses up front when the file holds more apartments than a household may", async () => {
    const user = userEvent.setup();
    renderWithHouseholdData(<DataTransferSettings />, {
      limits: { maxMembers: null, maxApartments: 1 },
      readImport: vi.fn(async () => parsedExport()),
    });
    await user.upload(screen.getByLabelText("Choose an export file"), zipFile());
    expect(await screen.findByRole("alert")).toHaveTextContent("but a household can hold 1.");
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("can be cancelled after choosing a file", async () => {
    const user = userEvent.setup();
    renderWithHouseholdData(<DataTransferSettings />, { readImport: vi.fn(async () => parsedExport()) });
    await user.upload(screen.getByLabelText("Choose an export file"), zipFile());
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Import" })).not.toBeInTheDocument();
  });

  it("says when the import could not run", async () => {
    const user = userEvent.setup();
    renderWithHouseholdData(<DataTransferSettings />, {
      readImport: vi.fn(async () => parsedExport()),
      importHousehold: vi.fn(async () => {
        throw new Error("Import needs an empty household");
      }),
    });
    await user.upload(screen.getByLabelText("Choose an export file"), zipFile());
    await user.click(await screen.findByRole("button", { name: "Import" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The import could not be run");
  });
});
