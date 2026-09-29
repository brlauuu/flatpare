import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithHouseholdData } from "@/components/household-data/__tests__/fake-household-data";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
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
import { parsePdf, ParsePdfError } from "@/components/household-data/process-client";
import { encryptAndUploadPdf } from "@/components/household-data/pdf-files";

function makePdfFile(name = "listing.pdf"): File {
  return new File([new Blob(["%PDF-1.4\n"], { type: "application/pdf" })], name, {
    type: "application/pdf",
  });
}

async function dropPdf(user: ReturnType<typeof userEvent.setup>, file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, file);
}

beforeEach(() => {
  vi.mocked(encryptAndUploadPdf).mockResolvedValue({ path: "/p", iv: null });
});

afterEach(() => cleanup());

describe("upload retry", () => {
  it("shows the quota message with retry-after and a Retry button", async () => {
    const user = userEvent.setup();
    vi.mocked(parsePdf).mockRejectedValueOnce(
      new ParsePdfError("AI quota exhausted", "quota", 429, 30)
    );
    renderWithHouseholdData(<UploadPage />);
    await dropPdf(user, makePdfFile());
    expect(await screen.findByText(/AI quota exhausted/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
  });

  it("shows the invalid-PDF message with a Retry button", async () => {
    const user = userEvent.setup();
    vi.mocked(parsePdf).mockRejectedValueOnce(
      new ParsePdfError("Could not read this PDF", "invalid_pdf", 400)
    );
    renderWithHouseholdData(<UploadPage />);
    await dropPdf(user, makePdfFile());
    expect(await screen.findByText(/Could not read this PDF/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
  });

  it("maps a non-ParsePdfError failure to reason 'unknown' and still offers Retry", async () => {
    const user = userEvent.setup();
    vi.mocked(parsePdf).mockRejectedValueOnce(new Error("network down"));
    renderWithHouseholdData(<UploadPage />);
    await dropPdf(user, makePdfFile());
    expect(await screen.findByText(/network down/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
  });

  it("re-runs parse and upload on Retry and transitions to done", async () => {
    const user = userEvent.setup();
    vi.mocked(parsePdf)
      .mockRejectedValueOnce(new ParsePdfError("AI quota exhausted", "quota", 429, 5))
      .mockResolvedValueOnce({ extracted: { name: "Parsed Apartment" }, aiAvailable: true });
    renderWithHouseholdData(<UploadPage />);
    await dropPdf(user, makePdfFile());
    await user.click(await screen.findByRole("button", { name: /Retry/i }));
    expect(await screen.findByText("Parsed Apartment")).toBeInTheDocument();
    expect(parsePdf).toHaveBeenCalledTimes(2);
    expect(encryptAndUploadPdf).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole("button", { name: /Retry/i })).toBeNull());
  });
});
