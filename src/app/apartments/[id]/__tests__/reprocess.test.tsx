import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  renderWithHouseholdData,
  makeApartmentView,
} from "@/components/household-data/__tests__/fake-household-data";

const push = vi.fn();
let currentParamsId = "a1";
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: currentParamsId }),
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
vi.mock("@/components/apartment-location-map", () => ({
  ApartmentLocationMap: ({ label }: { label: string }) => <div data-testid="pin-map">{label}</div>,
}));
vi.mock("@/components/household-data/pdf-files", () => ({
  encryptAndUploadPdf: vi.fn(),
  downloadPdf: vi.fn(),
}));
vi.mock("@/components/household-data/process-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/household-data/process-client")>()),
  parsePdf: vi.fn(),
}));

import ApartmentDetailPage from "../page";

afterEach(() => {
  cleanup();
  push.mockReset();
  vi.unstubAllGlobals();
});

import { downloadPdf } from "@/components/household-data/pdf-files";
import { parsePdf, ParsePdfError } from "@/components/household-data/process-client";

const PDF = { path: "/api/pdf/households/7/a1.pdf.enc", iv: "AAAA" };
const A1 = makeApartmentView({
  id: "a1",
  name: "Sonnenweg 3",
  rentChf: 2200,
  summary: "Original AI summary.",
  userEditedFields: ["rentChf"],
  pdf: PDF,
});

function setup(apartment = A1) {
  currentParamsId = "a1";
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
  const rendered = renderWithHouseholdData(<ApartmentDetailPage />, {
    apartments: [apartment],
    dataKey: null,
  });
  vi.mocked(rendered.value.updateApartment).mockImplementation(async (id, mutate) =>
    makeApartmentView({ ...mutate(apartment), id })
  );
  return rendered;
}

beforeEach(() => {
  vi.mocked(downloadPdf).mockResolvedValue(new Uint8Array([1, 2, 3]));
  vi.mocked(parsePdf).mockResolvedValue({
    extracted: { name: "Sonnenweg 3", rentChf: 2500, summary: "Refreshed summary after reprocess." },
    aiAvailable: true,
  });
});

describe("Apartment detail — reprocess", () => {
  it("decrypts the PDF, parses it and applies the extraction to un-edited fields only", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    await user.click(screen.getByRole("button", { name: /^Reprocess$/ }));

    await waitFor(() => expect(value.updateApartment).toHaveBeenCalledTimes(1));
    expect(downloadPdf).toHaveBeenCalledWith(null, 7, "a1", PDF);
    expect(parsePdf).toHaveBeenCalledWith(expect.any(Uint8Array), "a1.pdf");
    const next = vi.mocked(value.updateApartment).mock.calls[0][1](A1);
    expect(next.summary).toBe("Refreshed summary after reprocess.");
    expect(next.rentChf).toBe(2200); // user-edited: kept
    expect(next.rawExtractedData).toEqual(expect.objectContaining({ rentChf: 2500 }));
  });

  it("Reprocess is disabled when the apartment has no pdf", () => {
    setup(makeApartmentView({ ...A1, pdf: null }));
    expect(screen.getByRole("button", { name: /^Reprocess$/ })).toBeDisabled();
  });

  it("does nothing when the user cancels the confirm", async () => {
    const { value } = setup();
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    await userEvent.setup().click(screen.getByRole("button", { name: /^Reprocess$/ }));
    expect(downloadPdf).not.toHaveBeenCalled();
    expect(value.updateApartment).not.toHaveBeenCalled();
  });

  it("surfaces a ParsePdfError message and leaves the apartment untouched", async () => {
    vi.mocked(parsePdf).mockRejectedValue(new ParsePdfError("AI quota exhausted", "quota", 429, 30));
    const { value } = setup();
    await userEvent.setup().click(screen.getByRole("button", { name: /^Reprocess$/ }));
    expect(await screen.findByText(/Couldn't reprocess apartment/)).toBeInTheDocument();
    // The message appears both in the visible "Message:" line and inside the
    // collapsed stack trace <pre> (the Error's own stack includes its
    // message) — assert at least one match rather than a single element.
    expect(screen.getAllByText(/AI quota exhausted/).length).toBeGreaterThan(0);
    expect(value.updateApartment).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Reprocess$/ })).toBeEnabled();
  });
});
