import { describe, it, expect, vi, afterEach } from "vitest";
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

const PDF = { path: "/api/pdf/households/7/a1.pdf.enc", iv: "AAAA" };

describe("Apartment detail — View PDF", () => {
  it("decrypts the file and opens a blob: URL in a new tab", async () => {
    currentParamsId = "a1";
    const createObjectURL = vi.fn().mockReturnValue("blob:pdf-1");
    const open = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    vi.stubGlobal("open", open);
    vi.mocked(downloadPdf).mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));

    renderWithHouseholdData(<ApartmentDetailPage />, {
      apartments: [makeApartmentView({ id: "a1", name: "Sonnenweg 3", pdf: PDF })],
    });
    await userEvent.setup().click(screen.getByRole("button", { name: /^View PDF$/ }));

    await waitFor(() => expect(open).toHaveBeenCalledWith("blob:pdf-1", "_blank", "noopener"));
    expect(downloadPdf).toHaveBeenCalledWith(null, 7, "a1", PDF);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/pdf");
  });

  it("hides the button when there is no pdf", () => {
    currentParamsId = "a1";
    renderWithHouseholdData(<ApartmentDetailPage />, {
      apartments: [makeApartmentView({ id: "a1", pdf: null })],
    });
    expect(screen.queryByRole("button", { name: /^View PDF$/ })).toBeNull();
  });

  it("shows an error when decryption fails", async () => {
    currentParamsId = "a1";
    vi.mocked(downloadPdf).mockRejectedValue(new Error("Could not decrypt file"));
    renderWithHouseholdData(<ApartmentDetailPage />, {
      apartments: [makeApartmentView({ id: "a1", pdf: PDF })],
    });
    await userEvent.setup().click(screen.getByRole("button", { name: /^View PDF$/ }));
    expect(await screen.findByText(/Couldn't open PDF/)).toBeInTheDocument();
  });
});
