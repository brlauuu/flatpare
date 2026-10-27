import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  renderWithHouseholdData,
  makeApartmentView,
} from "@/components/household-data/__tests__/fake-household-data";
import type { DraftView } from "@/lib/household-data/types";

const pushMock = vi.fn();
let search = "draft=d1";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
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
import { parsePdf } from "@/components/household-data/process-client";
import { encryptAndUploadPdf } from "@/components/household-data/pdf-files";

const URL_D = "https://www.example.ch/listing/42";
function draft(over: Partial<DraftView> = {}): DraftView {
  return {
    id: "d1",
    corrupt: false,
    url: URL_D,
    title: "Nice flat",
    createdBy: "u1",
    createdByName: "Lena",
    createdAt: "2026-03-20T10:00:00Z",
    ...over,
  } as DraftView;
}

const MANUAL = /Or add manually without PDF/i;
function pdf(name: string) {
  return new File(["%PDF-1.4\n"], name, { type: "application/pdf" });
}
async function upload(user: ReturnType<typeof userEvent.setup>, files: File[]) {
  await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, files);
}

beforeEach(() => {
  search = "draft=d1";
  vi.mocked(encryptAndUploadPdf).mockResolvedValue({ path: "p", iv: "AAAA" });
  vi.mocked(parsePdf).mockImplementation(async (_b, filename) => ({
    extracted: { name: `Parsed ${filename}`, rentChf: 1500 },
    aiAvailable: true,
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  pushMock.mockReset();
});

describe("completing a draft", () => {
  it("names the draft's link on the upload step", () => {
    renderWithHouseholdData(<UploadPage />, { drafts: [draft()] });
    expect(screen.getByText("Adding the link you saved: www.example.ch")).toBeInTheDocument();
  });

  it("ignores an unknown or corrupt draft silently", () => {
    renderWithHouseholdData(<UploadPage />, { drafts: [] });
    expect(screen.queryByText(/Adding the link you saved/)).not.toBeInTheDocument();
    cleanup();
    renderWithHouseholdData(<UploadPage />, {
      drafts: [draft({ corrupt: true, url: null, title: null })],
    });
    expect(screen.queryByText(/Adding the link you saved/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: MANUAL })).toBeInTheDocument();
  });

  it("prefills url and title by hand, saves, then deletes the draft", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />, { drafts: [draft()] });
    vi.mocked(value.createApartment).mockImplementation(async (id, d) =>
      makeApartmentView({ id, ...d })
    );
    await user.click(screen.getByRole("button", { name: MANUAL }));
    expect(screen.getByLabelText(/^Name/i)).toHaveValue("Nice flat");
    expect(screen.getByLabelText(/listing/i)).toHaveValue(URL_D);
    await user.click(screen.getByRole("button", { name: /^Save apartment$/i }));
    await waitFor(() => expect(value.deleteDraft).toHaveBeenCalledWith("d1"));
    expect(value.deleteDraft).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
  });

  it("keeps the draft when the save is refused", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />, { drafts: [draft()] });
    vi.mocked(value.createApartment).mockRejectedValue(new Error("402"));
    await user.click(screen.getByRole("button", { name: MANUAL }));
    await user.click(screen.getByRole("button", { name: /^Save apartment$/i }));
    expect(await screen.findByText("Failed to save apartment")).toBeInTheDocument();
    expect(value.deleteDraft).not.toHaveBeenCalled();
  });

  it("still goes on when deleting the draft fails", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />, { drafts: [draft()] });
    vi.mocked(value.createApartment).mockImplementation(async (id, d) =>
      makeApartmentView({ id, ...d })
    );
    vi.mocked(value.deleteDraft).mockRejectedValue(new Error("boom"));
    await user.click(screen.getByRole("button", { name: MANUAL }));
    await user.click(screen.getByRole("button", { name: /^Save apartment$/i }));
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
  });

  it("PDF path: extracted URL wins, draft URL fills items without one, delete once after all saved", async () => {
    vi.mocked(parsePdf).mockImplementation(async (_b, filename) => ({
      extracted:
        filename === "a.pdf"
          ? { name: "A", listingUrl: "https://other.ch/a" }
          : { name: "B" },
      aiAvailable: true,
    }));
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />, { drafts: [draft()] });
    vi.mocked(value.createApartment).mockImplementation(async (id, d) =>
      makeApartmentView({ id, ...d })
    );
    await upload(user, [pdf("a.pdf"), pdf("b.pdf")]);
    const save = await screen.findByRole("button", { name: /save all/i });
    await user.click(save);
    await waitFor(() => expect(value.createApartment).toHaveBeenCalledTimes(2));
    const urls = vi.mocked(value.createApartment).mock.calls.map((c) => c[1].listingUrl);
    expect(urls).toEqual(["https://other.ch/a", URL_D]);
    await waitFor(() => expect(value.deleteDraft).toHaveBeenCalledTimes(1));
    expect(value.deleteDraft).toHaveBeenCalledWith("d1");
  });

  it("PDF path: one failed save keeps the draft", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />, { drafts: [draft()] });
    let n = 0;
    vi.mocked(value.createApartment).mockImplementation(async (id, d) => {
      if (n++ === 1) throw new Error("402");
      return makeApartmentView({ id, ...d });
    });
    await upload(user, [pdf("a.pdf"), pdf("b.pdf")]);
    await user.click(await screen.findByRole("button", { name: /save all/i }));
    await waitFor(() => expect(value.createApartment).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(value.deleteDraft).not.toHaveBeenCalled();
  });
});
