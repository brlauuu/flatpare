import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
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

const LIST = [
  makeApartmentView({ id: "a1", name: "Sonnenweg 3", createdAt: "2026-01-15T10:00:00Z" }),
  makeApartmentView({ id: "a2", name: "Bergstrasse 12", createdAt: "2026-03-20T10:00:00Z" }),
  makeApartmentView({ id: "a3", name: "Seeblick 7", createdAt: "2026-02-10T10:00:00Z" }),
];

beforeEach(() => localStorage.clear());

describe("Apartment detail page — pager", () => {
  it("renders position and enabled buttons for a middle apartment", () => {
    currentParamsId = "a3"; // Seeblick — middle under createdAt desc
    renderWithHouseholdData(<ApartmentDetailPage />, { apartments: LIST });
    expect(screen.getByRole("heading", { name: "Seeblick 7" })).toBeInTheDocument();
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Previous/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Next/i })).toBeEnabled();
  });

  it("clicking Next navigates to nextId", async () => {
    currentParamsId = "a3";
    renderWithHouseholdData(<ApartmentDetailPage />, { apartments: LIST });
    await userEvent.setup().click(screen.getByRole("button", { name: /Next/i }));
    expect(push).toHaveBeenCalledWith("/apartments/a1");
  });

  it("disables Previous on the first apartment", () => {
    currentParamsId = "a2";
    renderWithHouseholdData(<ApartmentDetailPage />, { apartments: LIST });
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Previous/i })).toBeDisabled();
  });

  it("disables Next on the last apartment", () => {
    currentParamsId = "a1";
    renderWithHouseholdData(<ApartmentDetailPage />, { apartments: LIST });
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
  });

  it("follows the persisted sort field", () => {
    localStorage.setItem("flatpare-apartments-sort-field", "rentChf");
    localStorage.setItem("flatpare-apartments-sort-direction", "asc");
    currentParamsId = "a2";
    renderWithHouseholdData(<ApartmentDetailPage />, {
      apartments: [
        makeApartmentView({ ...LIST[0], rentChf: 2200 }),
        makeApartmentView({ ...LIST[1], rentChf: 1800 }),
        makeApartmentView({ ...LIST[2], rentChf: 3000 }),
      ],
    });
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });
});
