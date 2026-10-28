// Receiving a share on the add page (#190). The entries are written the way
// public/sw.js writes them, into fake-indexeddb, and read back through the
// real stash.
import "fake-indexeddb/auto";
import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  renderWithHouseholdData,
  makeApartmentView,
  makeHouseholdData,
} from "@/components/household-data/__tests__/fake-household-data";
import { HouseholdDataContext } from "@/components/household-data/household-data-provider";
import {
  SHARE_DB_NAME,
  SHARE_DB_VERSION,
  SHARE_STORE,
  clearShares,
  readShare,
  type SharedItem,
} from "@/lib/share-stash";
import { ApiClientError } from "@/components/household-data/api-client";

const pushMock = vi.fn();
const replaceMock = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, refresh: vi.fn() }),
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

const LINK = "https://www.example.ch/listing/7";
const UNAVAILABLE = "That share did not reach Flatpare. Share it again, or upload the PDF here.";
const NOTHING = "Nothing that Flatpare can use was shared: no PDF and no link.";
const FULL = "This household holds as many apartments as it may. Delete one first.";

function entry(id: string, extra: Partial<SharedItem> = {}): SharedItem {
  return {
    id,
    createdAt: Date.now(),
    title: null,
    text: null,
    url: null,
    files: [],
    dropped: 0,
    ...extra,
  };
}

function put(item: SharedItem): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(SHARE_DB_NAME, SHARE_DB_VERSION);
    open.onupgradeneeded = () => open.result.createObjectStore(SHARE_STORE, { keyPath: "id" });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(SHARE_STORE, "readwrite");
      tx.objectStore(SHARE_STORE).put(item);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

function pdf(name = "listing.pdf") {
  return new File(["%PDF-1.4\n"], name, { type: "application/pdf" });
}

// The confirmation every share asks before anything is processed or saved.
async function tap(name: "Add", user = userEvent.setup()) {
  await user.click(await screen.findByRole("button", { name }));
}

beforeEach(async () => {
  await clearShares();
  search = "";
  vi.mocked(encryptAndUploadPdf).mockResolvedValue({ path: "p", iv: "AAAA" });
  vi.mocked(parsePdf).mockResolvedValue({
    extracted: { name: "Shared flat", rentChf: 1500 },
    aiAvailable: true,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  pushMock.mockReset();
  replaceMock.mockReset();
  delete (window as { launchQueue?: unknown }).launchQueue;
});

describe("receiving a shared PDF", () => {
  it("processes the file and prefills the link found in the text", async () => {
    await put(entry("s1", { text: `Look at this ${LINK} nice`, files: [pdf()] }));
    search = "share=s1";
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />);
    vi.mocked(value.createApartment).mockImplementation(async (id, d) =>
      makeApartmentView({ id, ...d })
    );
    await tap("Add", user);
    const save = await screen.findByRole("button", { name: /^Save apartment$/i });
    expect(parsePdf).toHaveBeenCalledTimes(1);
    await user.click(save);
    await waitFor(() => expect(value.createApartment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(value.createApartment).mock.calls[0][1].listingUrl).toBe(LINK);
    expect(value.createApartmentFromLink).not.toHaveBeenCalled();
  });

  it("keeps the shared link over the one read from the PDF", async () => {
    vi.mocked(parsePdf).mockResolvedValueOnce({
      extracted: { name: "A", listingUrl: "https://other.ch/a" },
      aiAvailable: true,
    });
    await put(entry("s1", { url: LINK, files: [pdf()] }));
    search = "share=s1";
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />);
    vi.mocked(value.createApartment).mockImplementation(async (id, d) =>
      makeApartmentView({ id, ...d })
    );
    await tap("Add", user);
    await user.click(await screen.findByRole("button", { name: /^Save apartment$/i }));
    await waitFor(() => expect(value.createApartment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(value.createApartment).mock.calls[0][1].listingUrl).toBe(LINK);
  });

  it("says how many non-PDF files were left out", async () => {
    await put(entry("s1", { files: [pdf()], dropped: 2 }));
    search = "share=s1";
    renderWithHouseholdData(<UploadPage />);
    await tap("Add");
    // The notice stays through processing; wait for the review step so the
    // assertion is not racing the step change.
    await screen.findByRole("button", { name: /^Save apartment$/i });
    expect(screen.getByText("2 files were left out: only PDFs can be added.")).toBeInTheDocument();
  });

  it("deletes the entry once every item saved", async () => {
    await put(entry("s1", { files: [pdf()] }));
    search = "share=s1";
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />);
    vi.mocked(value.createApartment).mockImplementation(async (id, d) =>
      makeApartmentView({ id, ...d })
    );
    await tap("Add", user);
    await user.click(await screen.findByRole("button", { name: /^Save apartment$/i }));
    // Anchored on the deletion itself, not on the navigation: the page only
    // pushes after a 500ms timer, which would race the waitFor default.
    await waitFor(async () => expect(await readShare("s1")).toBeNull());
  });

  it("keeps the entry when a save fails, so a reload offers it again", async () => {
    await put(entry("s1", { files: [pdf()] }));
    search = "share=s1";
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />);
    vi.mocked(value.createApartment).mockRejectedValue(new Error("402"));
    await tap("Add", user);
    await user.click(await screen.findByRole("button", { name: /^Save apartment$/i }));
    await waitFor(() => expect(value.createApartment).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(await readShare("s1")).not.toBeNull();
  });

  it("accepts a PDF whose type the sharing app left generic", async () => {
    const generic = new File(["%PDF-1.4\n"], "Listing.PDF", { type: "application/octet-stream" });
    await put(entry("s1", { files: [generic] }));
    search = "share=s1";
    renderWithHouseholdData(<UploadPage />);
    await tap("Add");
    expect(await screen.findByRole("button", { name: /^Save apartment$/i })).toBeInTheDocument();
    expect(screen.queryByText("No PDF files selected")).not.toBeInTheDocument();
  });
});

describe("confirming a shared PDF", () => {
  it("asks first, with the count, and processes nothing until Add", async () => {
    await put(entry("s1", { files: [pdf("a.pdf"), pdf("b.pdf")] }));
    search = "share=s1";
    const { value } = renderWithHouseholdData(<UploadPage />);
    expect(await screen.findByText("Add the 2 PDFs you shared?")).toBeInTheDocument();
    expect(parsePdf).not.toHaveBeenCalled();
    expect(encryptAndUploadPdf).not.toHaveBeenCalled();
    await tap("Add");
    await screen.findByRole("button", { name: /^Save all/i });
    expect(parsePdf).toHaveBeenCalledTimes(2);
    expect(value.createApartmentFromLink).not.toHaveBeenCalled();
  });

  it("Discard deletes the entry and leaves the normal upload step", async () => {
    await put(entry("s1", { url: LINK, files: [pdf()] }));
    search = "share=s1";
    const user = userEvent.setup();
    renderWithHouseholdData(<UploadPage />);
    expect(await screen.findByText("Add the PDF you shared?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(async () => expect(await readShare("s1")).toBeNull());
    expect(screen.queryByText("Add the PDF you shared?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose files" })).toBeInTheDocument();
    expect(parsePdf).not.toHaveBeenCalled();
  });

  it("acts without asking again when the pick-up prompt confirmed it", async () => {
    await put(entry("s1", { files: [pdf()] }));
    search = "share=s1&confirmed=1";
    renderWithHouseholdData(<UploadPage />);
    expect(await screen.findByRole("button", { name: /^Save apartment$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
  });

  it("after a partial save keeps only the files that did not save", async () => {
    await put(entry("s1", { files: [pdf("a.pdf"), pdf("b.pdf")] }));
    search = "share=s1";
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />);
    vi.mocked(value.createApartment)
      .mockImplementationOnce(async (id, d) => makeApartmentView({ id, ...d }))
      .mockRejectedValueOnce(new Error("402"));
    await tap("Add", user);
    await user.click(await screen.findByRole("button", { name: /^Save all/i }));
    await waitFor(() => expect(value.createApartment).toHaveBeenCalledTimes(2));
    await waitFor(async () => expect((await readShare("s1"))?.files).toHaveLength(1));
    expect(pushMock).not.toHaveBeenCalled();

    // Reopening it (the pick-up prompt's Add) processes only the one left.
    // Which one is not checked here: under jsdom, fake-indexeddb clones a
    // File into a plain object, so the two cannot be told apart once stored.
    cleanup();
    vi.mocked(parsePdf).mockClear();
    search = "share=s1&confirmed=1";
    renderWithHouseholdData(<UploadPage />);
    await screen.findByRole("button", { name: /^Save apartment$/i });
    expect(parsePdf).toHaveBeenCalledTimes(1);
  });
});

describe("receiving a shared link", () => {
  it("adds it as an unprocessed apartment once, deletes the entry and opens it (#413)", async () => {
    await put(entry("s1", { url: LINK, title: "Nice flat", dropped: 1 }));
    search = "share=s1";
    const { value } = renderWithHouseholdData(
      <StrictMode>
        <UploadPage />
      </StrictMode>
    );
    await tap("Add");
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/apartments/apt-from-link"));
    expect(value.createApartmentFromLink).toHaveBeenCalledTimes(1);
    expect(value.createApartmentFromLink).toHaveBeenCalledWith(LINK, "Nice flat");
    expect(await readShare("s1")).toBeNull();
  });

  it("finds the link in the text when the url field is empty", async () => {
    await put(entry("s1", { text: `Shared from an app: ${LINK}` }));
    search = "share=s1";
    const { value } = renderWithHouseholdData(<UploadPage />);
    await tap("Add");
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/apartments/apt-from-link"));
    expect(value.createApartmentFromLink).toHaveBeenCalledWith(LINK, null);
  });

  it("says the household is at its apartment cap and keeps the entry", async () => {
    await put(entry("s1", { url: LINK }));
    search = "share=s1";
    const { value } = renderWithHouseholdData(<UploadPage />);
    vi.mocked(value.createApartmentFromLink).mockRejectedValue(
      new ApiClientError(409, "Apartment limit reached", { error: "Apartment limit reached" })
    );
    await tap("Add");
    expect(await screen.findByText(FULL)).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(await readShare("s1")).not.toBeNull();
  });
});

describe("confirming a shared link", () => {
  it("names the host and adds nothing until Add", async () => {
    await put(entry("s1", { url: LINK }));
    search = "share=s1";
    const { value } = renderWithHouseholdData(<UploadPage />);
    expect(
      await screen.findByText("Add an apartment for the link you shared from www.example.ch?")
    ).toBeInTheDocument();
    expect(value.createApartmentFromLink).not.toHaveBeenCalled();
    expect(await readShare("s1")).not.toBeNull();
  });

  it("Discard deletes the entry and adds nothing", async () => {
    await put(entry("s1", { url: LINK }));
    search = "share=s1";
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<UploadPage />);
    await user.click(await screen.findByRole("button", { name: "Discard" }));
    await waitFor(async () => expect(await readShare("s1")).toBeNull());
    expect(value.createApartmentFromLink).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Choose files" })).toBeInTheDocument();
  });

  it("adds the apartment only once the store's first load is in", async () => {
    await put(entry("s1", { url: LINK }));
    search = "share=s1&confirmed=1";
    const ui = <UploadPage />;
    const loading = makeHouseholdData({ status: "loading" });
    const { rerender } = render(
      <HouseholdDataContext.Provider value={loading}>{ui}</HouseholdDataContext.Provider>
    );
    // The read has resolved and been applied (the share is pending, so the
    // confirmation is not shown); with the store still loading, nothing was
    // written.
    await act(async () => {
      await readShare("s1");
    });
    await act(async () => {});
    expect(loading.createApartmentFromLink).not.toHaveBeenCalled();

    const ready = { ...loading, status: "ready" as const };
    rerender(<HouseholdDataContext.Provider value={ready}>{ui}</HouseholdDataContext.Provider>);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/apartments/apt-from-link"));
    expect(loading.createApartmentFromLink).toHaveBeenCalledTimes(1);
    expect(loading.createApartmentFromLink).toHaveBeenCalledWith(LINK, null);
  });
});

describe("a share that cannot be used", () => {
  it("says so when the worker could not stash it", async () => {
    search = "share=unavailable";
    renderWithHouseholdData(<UploadPage />);
    expect(await screen.findByText(UNAVAILABLE)).toBeInTheDocument();
  });

  it("says so for an unknown or expired id", async () => {
    search = "share=gone";
    renderWithHouseholdData(<UploadPage />);
    expect(await screen.findByText(UNAVAILABLE)).toBeInTheDocument();
  });

  it("says nothing usable was shared", async () => {
    await put(entry("s1", { text: "just words", dropped: 1 }));
    search = "share=s1";
    const { value } = renderWithHouseholdData(<UploadPage />);
    expect(await screen.findByText(NOTHING)).toBeInTheDocument();
    expect(screen.getByText("1 file was left out: only PDFs can be added.")).toBeInTheDocument();
    expect(value.createApartmentFromLink).not.toHaveBeenCalled();
  });
});

describe("opening a PDF with Flatpare (launchQueue)", () => {
  it("feeds the launched files into processing", async () => {
    type Consumer = (params: { files: { getFile(): Promise<File> }[] }) => void;
    let consumer: Consumer | null = null;
    (window as { launchQueue?: unknown }).launchQueue = {
      setConsumer: (c: Consumer) => {
        consumer = c;
      },
    };
    renderWithHouseholdData(<UploadPage />);
    await waitFor(() => expect(consumer).not.toBeNull());
    await act(async () => {
      consumer!({ files: [{ getFile: async () => pdf("opened.pdf") }] });
    });
    expect(await screen.findByRole("button", { name: /^Save apartment$/i })).toBeInTheDocument();
    expect(vi.mocked(parsePdf).mock.calls[0][1]).toBe("opened.pdf");
  });
});
