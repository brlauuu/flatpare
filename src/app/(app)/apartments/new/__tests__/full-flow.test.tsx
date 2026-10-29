import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithHouseholdData } from "@/components/household-data/__tests__/fake-household-data";
import { makeApartmentView } from "@/components/household-data/__tests__/fake-household-data";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/household-data/process-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/household-data/process-client")>()),
  parsePdf: vi.fn(),
}));
vi.mock("@/components/household-data/pdf-files", () => ({
  encryptAndUploadPdf: vi.fn(),
  downloadPdf: vi.fn(),
}));

import UploadPage from "../page";
import { setTestLocale } from "@/i18n/__tests__/test-locale";
import { parsePdf, ParsePdfError } from "@/components/household-data/process-client";
import { encryptAndUploadPdf } from "@/components/household-data/pdf-files";

const PDF = { path: "/api/uploads/households/7/x.pdf.enc", iv: "AAAA" };

function makePdfFile(name: string): File {
  return new File([new Blob(["%PDF-1.4\n"], { type: "application/pdf" })], name, {
    type: "application/pdf",
  });
}

async function uploadFiles(user: ReturnType<typeof userEvent.setup>, files: File[]) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input).toBeTruthy();
  await user.upload(input, files);
}

beforeEach(() => {
  vi.mocked(parsePdf).mockImplementation(async (_bytes, filename) => ({
    extracted: { name: `Parsed ${filename}`, rentChf: 1500 },
    aiAvailable: true,
  }));
  vi.mocked(encryptAndUploadPdf).mockResolvedValue(PDF);
});

afterEach(() => {
  cleanup();
  pushMock.mockReset();
});

describe("manual single-entry flow", () => {
  it("shows the drop zone first", () => {
    renderWithHouseholdData(<UploadPage />);
    expect(screen.getByRole("button", { name: /Or add manually without PDF/i })).toBeInTheDocument();
  });

  it("switches to the manual form", async () => {
    const user = userEvent.setup();
    renderWithHouseholdData(<UploadPage />);
    await user.click(screen.getByRole("button", { name: /Or add manually without PDF/i }));
    expect(screen.getByLabelText(/^Name/i)).toBeInTheDocument();
  });

  it("requires a name", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />);
    await user.click(screen.getByRole("button", { name: /Or add manually without PDF/i }));
    fireEvent.submit(screen.getByLabelText(/^Name/i).closest("form")!);
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(value.createApartment).not.toHaveBeenCalled();
  });

  it("saves a manual apartment through the store and redirects to its detail page", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />);
    vi.mocked(value.createApartment).mockImplementation(async (id, data) =>
      makeApartmentView({ id, ...data })
    );
    await user.click(screen.getByRole("button", { name: /Or add manually without PDF/i }));
    await user.type(screen.getByLabelText(/^Name/i), "Manual Flat");
    await user.type(screen.getByLabelText(/Rent/i), "1800");
    await user.click(screen.getByRole("button", { name: /^Save apartment$/i }));

    await waitFor(() => expect(value.createApartment).toHaveBeenCalledTimes(1));
    const [id, data] = vi.mocked(value.createApartment).mock.calls[0];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(data).toEqual(expect.objectContaining({ name: "Manual Flat", rentChf: 1800, pdf: null }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(`/apartments/${id}`));
  });

  it("shows an error when the store rejects the save", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />);
    vi.mocked(value.createApartment).mockRejectedValue(new Error("Duplicate id"));
    await user.click(screen.getByRole("button", { name: /Or add manually without PDF/i }));
    await user.type(screen.getByLabelText(/^Name/i), "Manual Flat");
    await user.click(screen.getByRole("button", { name: /^Save apartment$/i }));
    expect(await screen.findByText("Failed to save apartment")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("cancel returns to the drop zone", async () => {
    const user = userEvent.setup();
    renderWithHouseholdData(<UploadPage />);
    await user.click(screen.getByRole("button", { name: /Or add manually without PDF/i }));
    await user.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(screen.getByRole("button", { name: /Or add manually without PDF/i })).toBeInTheDocument();
  });
});

describe("drop zone validation", () => {
  it("rejects non-PDF files", async () => {
    const user = userEvent.setup();
    renderWithHouseholdData(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["x"], "notes.txt", { type: "text/plain" }));
    // jsdom honours the input's accept filter when it can; either the file
    // is dropped before reaching the page or the page rejects it.
    await waitFor(() =>
      expect(
        screen.queryByText("No PDF files selected") ??
          screen.getByRole("button", { name: /Or add manually without PDF/i })
      ).toBeInTheDocument()
    );
    expect(parsePdf).not.toHaveBeenCalled();
  });
});

describe("batch review flow", () => {
  // #288: the summary is asked for in the uploader's interface language.
  it("passes the interface language to the extraction", async () => {
    setTestLocale("es");
    const user = userEvent.setup();
    renderWithHouseholdData(<UploadPage />, { dataKey: null });
    await uploadFiles(user, [makePdfFile("a.pdf")]);
    await waitFor(() => expect(parsePdf).toHaveBeenCalledTimes(1));
    expect(vi.mocked(parsePdf).mock.calls[0][2]).toBe("es");
  });

  it("parses and encrypt-uploads each PDF concurrently, then saves all through the store", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />, {
      dataKey: null,
      identity: { userId: "u-me", householdId: 7, userName: "Me", role: "owner" },
    });
    vi.mocked(value.createApartment).mockImplementation(async (id, data) =>
      makeApartmentView({ id, ...data })
    );

    await uploadFiles(user, [makePdfFile("a.pdf"), makePdfFile("b.pdf")]);

    expect(await screen.findByText("Parsed a.pdf")).toBeInTheDocument();
    expect(screen.getByText("Parsed b.pdf")).toBeInTheDocument();
    expect(parsePdf).toHaveBeenCalledTimes(2);
    expect(encryptAndUploadPdf).toHaveBeenCalledTimes(2);
    expect(vi.mocked(parsePdf).mock.calls.map((c) => c[2])).toEqual(["en", "en"]);
    // Upload is keyed by the item id, which is also the apartment id.
    const [, householdId, uploadedId] = vi.mocked(encryptAndUploadPdf).mock.calls[0];
    expect(householdId).toBe(7);
    expect(uploadedId).toMatch(/^[0-9a-f-]{36}$/);

    await user.click(screen.getByRole("button", { name: /Save all 2/i }));
    await waitFor(() => expect(screen.getAllByText("Saved")).toHaveLength(2));
    expect(value.createApartment).toHaveBeenCalledTimes(2);
    const [savedId, savedData] = vi.mocked(value.createApartment).mock.calls[0];
    expect(savedId).toBe(uploadedId);
    expect(savedData).toEqual(
      expect.objectContaining({ name: "Parsed a.pdf", rentChf: 1500, pdf: PDF })
    );
    expect(savedData.rawExtractedData).toEqual({ name: "Parsed a.pdf", rentChf: 1500 });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/apartments"));
  });

  it("saves with pdf: null and shows a warning when the upload fails", async () => {
    const user = userEvent.setup();
    vi.mocked(encryptAndUploadPdf).mockRejectedValue(new Error("Blob down"));
    const { value } = renderWithHouseholdData(<UploadPage />);
    vi.mocked(value.createApartment).mockImplementation(async (id, data) =>
      makeApartmentView({ id, ...data })
    );

    await uploadFiles(user, [makePdfFile("a.pdf")]);
    expect(await screen.findByText("Parsed a.pdf")).toBeInTheDocument();
    expect(screen.getByText(/PDF could not be stored/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Save apartment/i }));
    await waitFor(() => expect(value.createApartment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(value.createApartment).mock.calls[0][1].pdf).toBeNull();
  });

  // #413: reading the PDF spends the apartment's credit.
  it("saves a read PDF as processed, and names its id to the read", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />);
    vi.mocked(value.createApartment).mockImplementation(async (id, data) => makeApartmentView({ id, ...data }));
    await uploadFiles(user, [makePdfFile("a.pdf")]);
    await user.click(await screen.findByRole("button", { name: /Save apartment/i }));
    await waitFor(() => expect(value.createApartment).toHaveBeenCalledTimes(1));
    const [id, data] = vi.mocked(value.createApartment).mock.calls[0];
    expect(vi.mocked(parsePdf).mock.calls[0][3]).toBe(id);
    expect(data.processed).toBe(true);
  });

  it("keeps a PDF it could not read for want of credit, to save unprocessed", async () => {
    const user = userEvent.setup();
    vi.mocked(parsePdf).mockRejectedValue(new ParsePdfError("No apartment credits left", "no_credits", 402));
    const { value } = renderWithHouseholdData(<UploadPage />);
    vi.mocked(value.createApartment).mockImplementation(async (id, data) => makeApartmentView({ id, ...data }));
    await uploadFiles(user, [makePdfFile("Flat on the hill.pdf")]);
    expect(await screen.findByText(/Not read: no apartment credits left/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Save apartment/i }));
    await waitFor(() => expect(value.createApartment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(value.createApartment).mock.calls[0][1]).toMatchObject({
      name: "Flat on the hill",
      processed: false,
      rawExtractedData: null,
      pdf: PDF,
    });
  });

  // #438: refused in the browser before anything is sent; stored all the same.
  it("keeps a PDF too large to read, says how to make it smaller, and saves it unprocessed", async () => {
    const user = userEvent.setup();
    vi.mocked(parsePdf).mockRejectedValue(new ParsePdfError("PDF too large to read", "too_large", 413));
    const { value } = renderWithHouseholdData(<UploadPage />, {
      limits: { maxMembers: null, maxApartments: null, pdfReadMaxBytes: 4_483_616 },
    });
    vi.mocked(value.createApartment).mockImplementation(async (id, data) => makeApartmentView({ id, ...data }));
    await uploadFiles(user, [makePdfFile("Big flat.pdf")]);
    expect(await screen.findByText("This PDF is too large to read")).toBeInTheDocument();
    expect(screen.getByText(/PDFs up to 4.5 MB can be read/)).toBeInTheDocument();
    expect(screen.queryByText(/Not read: no apartment credits left/)).not.toBeInTheDocument();
    expect(vi.mocked(parsePdf).mock.calls[0][5]).toBe(4_483_616);
    await user.click(screen.getByRole("button", { name: /Save apartment/i }));
    await waitFor(() => expect(value.createApartment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(value.createApartment).mock.calls[0][1]).toMatchObject({
      name: "Big flat",
      processed: false,
      rawExtractedData: null,
      pdf: PDF,
    });
  });

  it("saves as unprocessed when no AI is configured, since nothing was read", async () => {
    const user = userEvent.setup();
    vi.mocked(parsePdf).mockResolvedValue({ extracted: { name: "a" }, aiAvailable: false });
    const { value } = renderWithHouseholdData(<UploadPage />);
    vi.mocked(value.createApartment).mockImplementation(async (id, data) => makeApartmentView({ id, ...data }));
    await uploadFiles(user, [makePdfFile("a.pdf")]);
    await user.click(await screen.findByRole("button", { name: /Save apartment/i }));
    await waitFor(() => expect(value.createApartment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(value.createApartment).mock.calls[0][1].processed).toBe(false);
  });

  it("marks an item 'Failed to save' when the store rejects it and does not redirect", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />);
    vi.mocked(value.createApartment).mockRejectedValue(new Error("Stale version"));

    await uploadFiles(user, [makePdfFile("a.pdf")]);
    await screen.findByText("Parsed a.pdf");
    await user.click(screen.getByRole("button", { name: /Save apartment/i }));
    expect(await screen.findByText("Failed to save")).toBeInTheDocument();

    // Deterministic by construction, not by timing: with a failed item the
    // redirect timer is never scheduled, so there is no pending work that
    // could make this true later. Before the #227 fix the timer *was*
    // scheduled (500ms) and this assertion passed only by running first.
    expect(pushMock).not.toHaveBeenCalled();
    // Belt: give the old timer's window a chance to elapse and re-check, so a
    // regression that reinstates the redirect fails here rather than flaking.
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByText("Failed to save")).toBeInTheDocument();
  });

  it("'Upload more' returns to the drop zone and a discarded item is skipped on save", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />);
    vi.mocked(value.createApartment).mockImplementation(async (id, data) =>
      makeApartmentView({ id, ...data })
    );
    await uploadFiles(user, [makePdfFile("a.pdf"), makePdfFile("b.pdf")]);
    await screen.findByText("Parsed b.pdf");

    // Discard b (the ✕ buttons are in card order).
    const discardButtons = screen.getAllByRole("button", { name: "✕" });
    await user.click(discardButtons[1]);
    expect(screen.queryByText("Parsed b.pdf")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Save apartment/i }));
    await waitFor(() => expect(value.createApartment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(value.createApartment).mock.calls[0][1].name).toBe("Parsed a.pdf");
  });

  it("expanding a card shows its editable fields and edits flow into the saved data", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />);
    vi.mocked(value.createApartment).mockImplementation(async (id, data) =>
      makeApartmentView({ id, ...data })
    );
    await uploadFiles(user, [makePdfFile("a.pdf")]);
    await user.click(await screen.findByText("Parsed a.pdf"));
    const name = screen.getByLabelText(/^Name/i);
    await user.clear(name);
    await user.type(name, "Renamed");
    await user.click(screen.getByRole("button", { name: /Save apartment/i }));
    await waitFor(() => expect(value.createApartment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(value.createApartment).mock.calls[0][1].name).toBe("Renamed");
  });
});

describe("Save all guard", () => {
  // review-step.tsx only renders the Save button when at least one item is
  // saveable (status "done", not saved/discarded, non-empty name), so an
  // all-empty-name batch never shows a Save button to click — this pins
  // that guard instead of exercising the (unreachable via UI) handler
  // branch the brief's literal test assumed.
  it("hides the Save button when every parsed item has an empty name", async () => {
    const user = userEvent.setup();
    vi.mocked(parsePdf).mockResolvedValue({ extracted: { name: "" }, aiAvailable: true });
    const { value } = renderWithHouseholdData(<UploadPage />);
    await uploadFiles(user, [makePdfFile("a.pdf")]);
    await waitFor(() => expect(screen.getByText("Parsed")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Save/i })).toBeNull();
    expect(value.createApartment).not.toHaveBeenCalled();
  });
});
