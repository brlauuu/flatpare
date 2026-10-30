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

// #452: the pager, the code, my rating and the actions share one row from
// `sm` up, and the title sits under it at full width.
describe("Apartment detail page — header row", () => {
  it("holds the pager, the code with my rating and the actions, then the title", () => {
    currentParamsId = "a1";
    renderWithHouseholdData(<ApartmentDetailPage />, {
      apartments: [makeApartmentView({ ...LIST[0], shortCode: "KTR-3B-1b-WY-8003", myRating: 4 }), ...LIST.slice(1)],
    });
    const header = document.querySelector("[data-apartment-header]")!;
    expect(header).toHaveClass("flex", "flex-wrap");
    const children = [...header.children];
    expect(children[0]).toContainElement(screen.getByRole("button", { name: "Previous" }));
    const code = header.querySelector("[data-apartment-code]")!;
    expect(code).toHaveTextContent("KTR-3B-1b-WY-8003");
    expect(code).toContainElement(screen.getByTitle("Rated"));
    const actions = screen.getByRole("button", { name: "Edit" }).closest("div.order-last")!;
    expect(actions.parentElement).toBe(header);
    expect(actions).toHaveClass("sm:order-none", "sm:ml-auto");
    const title = screen.getByRole("heading", { level: 1 }).parentElement!;
    expect(title.parentElement).toBe(header);
    expect(title).toHaveClass("basis-full");
    // Phone order: title before the actions; from `sm` up, after them.
    expect(children.indexOf(title)).toBeGreaterThan(children.indexOf(actions));
  });

  it("shows the empty circle when I have not rated it", () => {
    currentParamsId = "a1";
    renderWithHouseholdData(<ApartmentDetailPage />, { apartments: LIST });
    expect(document.querySelector("[data-apartment-code]")).toContainElement(screen.getByTitle("Not yet rated"));
  });
});
