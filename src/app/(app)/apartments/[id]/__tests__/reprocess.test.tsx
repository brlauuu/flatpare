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
vi.mock("@/components/household-data/pdf-files", () => ({
  encryptAndUploadPdf: vi.fn(),
  downloadPdf: vi.fn(),
}));
vi.mock("@/components/household-data/process-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/household-data/process-client")>()),
  parsePdf: vi.fn(),
}));

import ApartmentDetailPage from "../page";
import { setTestLocale } from "@/i18n/__tests__/test-locale";

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

function setupWith(over: Parameters<typeof renderWithHouseholdData>[1]) {
  currentParamsId = "a1";
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
  return renderWithHouseholdData(<ApartmentDetailPage />, { dataKey: null, ...over });
}

beforeEach(() => {
  vi.mocked(downloadPdf).mockResolvedValue(new Uint8Array([1, 2, 3]));
  vi.mocked(parsePdf).mockResolvedValue({
    extracted: { name: "Sonnenweg 3", rentChf: 2500, summary: "Refreshed summary after reprocess." },
    aiAvailable: true,
  });
});

describe("Apartment detail — reprocess", () => {
  // #288: a reprocessed summary is written in the language of whoever
  // pressed Reprocess.
  it("asks for the summary in the interface language", async () => {
    setTestLocale("it");
    const user = userEvent.setup();
    const { value } = setup();
    await user.click(screen.getByRole("button", { name: /^Rielabora$|^Reprocess$/ }));
    await waitFor(() => expect(value.relocateApartment).toHaveBeenCalledTimes(1));
    expect(parsePdf).toHaveBeenCalledWith(expect.any(Uint8Array), "a1.pdf", "it", "a1");
  });

  it("charges, decrypts the PDF, parses it and applies the extraction to un-edited fields only", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    await user.click(screen.getByRole("button", { name: /^Reprocess$/ }));

    await waitFor(() => expect(value.relocateApartment).toHaveBeenCalledTimes(1));
    expect(value.chargeReprocess).toHaveBeenCalledWith("a1");
    expect(vi.mocked(value.chargeReprocess).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(downloadPdf).mock.invocationCallOrder[0]
    );
    expect(downloadPdf).toHaveBeenCalledWith(null, 7, "a1", PDF);
    expect(parsePdf).toHaveBeenCalledWith(expect.any(Uint8Array), "a1.pdf", "en", "a1");
    const next = vi.mocked(value.relocateApartment).mock.calls[0][1]!(A1);
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
    expect(value.relocateApartment).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Reprocess$/ })).toBeEnabled();
  });

  // #413: a reprocess spends one credit, and says so before the click.
  it("names the credit in the confirmation when billing is on", async () => {
    const confirm = vi.fn().mockReturnValue(false);
    setupWith({ apartments: [A1], credits: { granted: 40, used: 1, remaining: 39 } });
    vi.stubGlobal("confirm", confirm);
    await userEvent.setup().click(screen.getByRole("button", { name: /^Reprocess$/ }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("for one apartment credit"));
  });

  it("does not mention credits when billing is off", async () => {
    const confirm = vi.fn().mockReturnValue(false);
    setupWith({ apartments: [A1] });
    vi.stubGlobal("confirm", confirm);
    await userEvent.setup().click(screen.getByRole("button", { name: /^Reprocess$/ }));
    expect(confirm).toHaveBeenCalledWith(expect.not.stringContaining("credit"));
  });

  it("stops before reading anything when the charge is refused", async () => {
    const { value } = setupWith({ apartments: [A1], credits: { granted: 1, used: 1, remaining: 0 } });
    vi.mocked(value.chargeReprocess).mockRejectedValue(new Error("No apartment credits left"));
    await userEvent.setup().click(screen.getByRole("button", { name: /^Reprocess$/ }));
    expect(await screen.findByText(/Couldn't reprocess apartment/)).toBeInTheDocument();
    expect(downloadPdf).not.toHaveBeenCalled();
    expect(value.relocateApartment).not.toHaveBeenCalled();
  });

  it("reprocesses an apartment without a PDF by its address", async () => {
    const byAddress = makeApartmentView({ id: "a1", name: "Flat", address: "Street 1", processedAddress: "Old 2" });
    const { value } = setupWith({ apartments: [byAddress] });
    await userEvent.setup().click(screen.getByRole("button", { name: /^Reprocess$/ }));
    await waitFor(() => expect(value.relocateApartment).toHaveBeenCalledTimes(1));
    expect(parsePdf).not.toHaveBeenCalled();
  });
});

// #413: an apartment added by hand or from a link, not processed yet.
describe("Apartment detail — not processed yet", () => {
  it("says it can be rated for free and how processing is paid", () => {
    setupWith({
      apartments: [makeApartmentView({ id: "a1", name: "By hand", processed: false })],
      credits: { granted: 40, used: 0, remaining: 40 },
    });
    expect(screen.getByText("Not processed yet")).toBeInTheDocument();
    expect(screen.getByText(/Rate and describe it for free/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Process/ })).toBeNull();
    // Rating needs nothing processed.
    expect(screen.getByRole("button", { name: /Save rating|Save/ })).toBeInTheDocument();
  });

  it("says nothing about credits when billing is off", () => {
    setupWith({ apartments: [makeApartmentView({ id: "a1", name: "By hand", processed: false })] });
    expect(screen.getByText(/Rate and describe it as you like/)).toBeInTheDocument();
    expect(screen.queryByText(/credit/)).toBeNull();
  });

  it("offers to process an address that was saved without credit, and links to buying more", async () => {
    const apt = makeApartmentView({ id: "a1", name: "Flat", address: "Street 1", processed: false });
    const { value } = setupWith({ apartments: [apt], credits: { granted: 40, used: 40, remaining: 0 } });
    expect(screen.getByText("No apartment credits left.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buy more" })).toHaveAttribute("href", "/billing");
    expect(screen.getByRole("button", { name: "Process (1 credit)" })).toBeDisabled();
    expect(value.processApartment).not.toHaveBeenCalled();
  });

  it("processes by address with a credit to spend", async () => {
    const apt = makeApartmentView({ id: "a1", name: "Flat", address: "Street 1", processed: false });
    const { value } = setupWith({ apartments: [apt], credits: { granted: 40, used: 2, remaining: 38 } });
    await userEvent.setup().click(screen.getByRole("button", { name: "Process (1 credit)" }));
    await waitFor(() => expect(value.processApartment).toHaveBeenCalledWith("a1"));
    expect(parsePdf).not.toHaveBeenCalled();
  });

  it("reads an unread PDF first, filling only the empty fields", async () => {
    const apt = makeApartmentView({ id: "a1", name: "Our name", rentChf: 1900, pdf: PDF, processed: false });
    const { value } = setupWith({ apartments: [apt] });
    vi.mocked(value.updateApartment).mockImplementation(async (id, mutate) => makeApartmentView({ ...mutate(apt), id }));
    await userEvent.setup().click(screen.getByRole("button", { name: "Process" }));
    await waitFor(() => expect(value.updateApartment).toHaveBeenCalledTimes(1));
    expect(parsePdf).toHaveBeenCalledWith(expect.any(Uint8Array), "a1.pdf", "en", "a1");
    const next = vi.mocked(value.updateApartment).mock.calls[0][1](apt);
    expect(next).toMatchObject({
      processed: true,
      name: "Our name",
      rentChf: 1900,
      summary: "Refreshed summary after reprocess.",
    });
    expect(value.processApartment).not.toHaveBeenCalled();
  });

  it("hides stale distances behind a note when the address changed", () => {
    setupWith({
      apartments: [makeApartmentView({ id: "a1", name: "Flat", address: "New 1", processedAddress: "Old 2", addressChanged: true })],
      locations: [{ id: "l1", label: "Work", icon: "Briefcase", address: "Office", latitude: 1, longitude: 1, sortOrder: 0 }],
    });
    expect(screen.getByText(/The address changed\. Reprocess/)).toBeInTheDocument();
    expect(screen.queryByText(/min bike/)).toBeNull();
  });
});
