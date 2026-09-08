import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  renderWithHouseholdData,
  makeApartmentView,
  makeLocationView,
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

const A1 = makeApartmentView({ id: "a1", name: "Sonnenweg 3", address: "Sonnenweg 3, 8001 Zurich" });

describe("Apartment detail — loading, not-found and error states", () => {
  it("renders the loading placeholder while the store is loading", () => {
    currentParamsId = "a1";
    renderWithHouseholdData(<ApartmentDetailPage />, { status: "loading", apartments: [] });
    expect(screen.getByText(/Loading\.\.\./i)).toBeInTheDocument();
  });

  it("renders ErrorDisplay when the store failed to load", () => {
    currentParamsId = "a1";
    renderWithHouseholdData(<ApartmentDetailPage />, {
      status: "error",
      error: "Failed to load household data",
      apartments: [],
    });
    expect(screen.getByText(/Failed to load household data/)).toBeInTheDocument();
  });

  it("renders the not-found message when the id is not in the store", () => {
    currentParamsId = "nope";
    renderWithHouseholdData(<ApartmentDetailPage />, { apartments: [A1] });
    expect(screen.getByText(/Apartment not found/)).toBeInTheDocument();
  });

  it("renders the corrupt placeholder with a delete action for a corrupt row", async () => {
    currentParamsId = "a1";
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const { value } = renderWithHouseholdData(<ApartmentDetailPage />, {
      apartments: [makeApartmentView({ id: "a1", corrupt: true })],
    });
    expect(screen.getByText(/could not be decrypted/i)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /^Delete$/ }));
    await waitFor(() => expect(value.deleteApartment).toHaveBeenCalledWith("a1"));
    expect(push).toHaveBeenCalledWith("/apartments");
  });

  it("surfaces an error when delete fails", async () => {
    currentParamsId = "a1";
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const { value } = renderWithHouseholdData(<ApartmentDetailPage />, { apartments: [A1] });
    vi.mocked(value.deleteApartment).mockRejectedValue(new Error("boom"));
    await userEvent.setup().click(screen.getByRole("button", { name: /^Delete$/ }));
    expect(await screen.findByText(/Couldn't delete apartment/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("aborts delete when the user cancels confirm()", async () => {
    currentParamsId = "a1";
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    const { value } = renderWithHouseholdData(<ApartmentDetailPage />, { apartments: [A1] });
    await userEvent.setup().click(screen.getByRole("button", { name: /^Delete$/ }));
    expect(value.deleteApartment).not.toHaveBeenCalled();
  });

  it("deletes through the store and redirects to the list", async () => {
    currentParamsId = "a1";
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const { value } = renderWithHouseholdData(<ApartmentDetailPage />, { apartments: [A1] });
    await userEvent.setup().click(screen.getByRole("button", { name: /^Delete$/ }));
    await waitFor(() => expect(value.deleteApartment).toHaveBeenCalledWith("a1"));
    expect(push).toHaveBeenCalledWith("/apartments");
  });

  it("renders the pin map from stored coordinates and the distance section from the store's locations", () => {
    currentParamsId = "a1";
    renderWithHouseholdData(<ApartmentDetailPage />, {
      apartments: [
        makeApartmentView({
          id: "a1",
          name: "Sonnenweg 3",
          latitude: 47.37,
          longitude: 8.54,
          distances: { "loc-1": { bikeMin: 12, transitMin: 25 } },
        }),
      ],
      locations: [makeLocationView({ id: "loc-1", label: "Work", icon: "Briefcase", address: "Zurich HQ" })],
    });
    expect(screen.getByTestId("pin-map")).toHaveTextContent("Sonnenweg 3");
    expect(screen.getByText(/12 min bike.*25 min transit/)).toBeInTheDocument();
  });
});
