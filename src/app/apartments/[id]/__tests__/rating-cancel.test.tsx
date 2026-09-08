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

const ALICE = { userId: "u-me", userName: "Me", updatedAt: "2026-01-02T00:00:00.000Z" };
const A1 = makeApartmentView({
  id: "a1",
  name: "Test Flat",
  ratings: [
    { ...ALICE, kitchen: 3, balconies: 3, location: 3, floorplan: 3, overallFeeling: 3, comment: "saved text" },
    { userId: "u-bob", userName: "Bob", updatedAt: "2026-01-03T00:00:00.000Z", kitchen: 5, balconies: 4, location: 4, floorplan: 4, overallFeeling: 5, comment: "Bob's view" },
  ],
});

function setup() {
  currentParamsId = "a1";
  return renderWithHouseholdData(<ApartmentDetailPage />, { apartments: [A1] });
}

describe("Rating panel", () => {
  it("prefills my rating from the store and lists the other member's panel", () => {
    setup();
    expect(screen.getByText(/Your Rating \(Me\)/)).toBeInTheDocument();
    expect((screen.getByPlaceholderText(/Notes about this apartment/i) as HTMLTextAreaElement).value).toBe("saved text");
    expect(screen.getByText(/Bob’s Rating/)).toBeInTheDocument();
    expect(screen.getByText("Bob's view")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save Rating/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Cancel$/ })).toBeDisabled();
  });

  it("Cancel reverts an unsaved comment change and re-disables both buttons", async () => {
    const user = userEvent.setup();
    setup();
    const comment = screen.getByPlaceholderText(/Notes about this apartment/i) as HTMLTextAreaElement;
    await user.clear(comment);
    await user.type(comment, "edited but not saved");
    expect(screen.getByRole("button", { name: /Save Rating/ })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: /^Cancel$/ }));
    expect(comment.value).toBe("saved text");
    expect(screen.getByRole("button", { name: /Save Rating/ })).toBeDisabled();
  });

  it("Save Rating calls rateApartment with the draft and redirects to /apartments", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    const comment = screen.getByPlaceholderText(/Notes about this apartment/i);
    await user.clear(comment);
    await user.type(comment, "new comment");
    await user.click(screen.getByRole("button", { name: /Save Rating/ }));
    await waitFor(() => expect(value.rateApartment).toHaveBeenCalledTimes(1));
    expect(value.rateApartment).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({ overallFeeling: 3, comment: "new comment" })
    );
    expect(push).toHaveBeenCalledWith("/apartments");
  });

  it("shows an error when rateApartment rejects", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    vi.mocked(value.rateApartment).mockRejectedValue(new Error("boom"));
    await user.type(screen.getByPlaceholderText(/Notes about this apartment/i), "!");
    await user.click(screen.getByRole("button", { name: /Save Rating/ }));
    expect(await screen.findByText(/Couldn't save rating/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
