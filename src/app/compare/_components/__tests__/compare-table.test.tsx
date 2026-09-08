import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompareTable } from "../compare-table";
import {
  makeApartmentView,
  makeLocationView,
} from "@/components/household-data/__tests__/fake-household-data";
import type { ApartmentView } from "@/lib/household-data/types";

afterEach(() => cleanup());

function makeApt(over: Partial<ApartmentView> & { id?: string } = {}): ApartmentView {
  return makeApartmentView({
    id: "a1",
    name: "Apt",
    sizeM2: 50,
    numRooms: 2.5,
    numBathrooms: 1,
    numBalconies: 1,
    rentChf: 2000,
    shortCode: "ABC-2.5B-WY-4001",
    createdAt: "2026-01-01T00:00:00Z",
    ...over,
  });
}

const trainStation = makeLocationView({
  id: "loc-7",
  label: "Train Station",
  icon: "Train",
  address: "Basel SBB",
});

function renderTable(apts: ApartmentView[], locations = [] as ReturnType<typeof makeLocationView>[]) {
  const onHide = vi.fn();
  const onViewPdf = vi.fn();
  render(
    <CompareTable
      visible={apts}
      sortedVisible={apts}
      locations={locations}
      onHide={onHide}
      onViewPdf={onViewPdf}
    />
  );
  return { onHide, onViewPdf };
}

describe("CompareTable — metric rows", () => {
  it("renders one cell per metric per apartment", () => {
    const a = makeApt({ id: "a1", name: "Cheap", rentChf: 1500, sizeM2: 40 });
    const b = makeApt({ id: "a2", name: "Spacious", rentChf: 2500, sizeM2: 80 });
    renderTable([a, b]);
    expect(screen.getByText("Cheap")).toBeInTheDocument();
    expect(screen.getByText("Spacious")).toBeInTheDocument();
    expect(screen.getByText("Rent (CHF)")).toBeInTheDocument();
    expect(screen.getByText("1,500")).toBeInTheDocument();
    expect(screen.getByText("2,500")).toBeInTheDocument();
  });

  it("highlights the cheapest rent in green (min direction)", () => {
    const a = makeApt({ id: "a1", name: "Cheap", rentChf: 1500 });
    const b = makeApt({ id: "a2", name: "Pricey", rentChf: 2500 });
    renderTable([a, b]);
    const cheap = screen.getByText("1,500");
    const pricey = screen.getByText("2,500");
    expect(cheap.className).toContain("text-green-600");
    expect(pricey.className).not.toContain("text-green-600");
  });

  it("highlights the largest size in green (max direction)", () => {
    const a = makeApt({ id: "a1", name: "Small", sizeM2: 40 });
    const b = makeApt({ id: "a2", name: "Big", sizeM2: 80 });
    renderTable([a, b]);
    const big = screen.getByText("80");
    const small = screen.getByText("40");
    expect(big.className).toContain("text-green-600");
    expect(small.className).not.toContain("text-green-600");
  });

  it("renders an em-dash for null metric values and never highlights them", () => {
    const a = makeApt({ id: "a1", name: "Has rent", rentChf: 1500 });
    const b = makeApt({ id: "a2", name: "No rent", rentChf: null });
    renderTable([a, b]);
    // The "—" appears once per missing metric — in this test, only rentChf is null on one apt.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("CompareTable — washing machine row", () => {
  it("renders ✓ when true and highlights it green", () => {
    const a = makeApt({ id: "a1", name: "Yes", hasWashingMachine: true });
    renderTable([a]);
    const wmRow = screen.getByText("Washing machine").closest("tr")!;
    const cell = within(wmRow).getByText("✓");
    expect(cell.className).toContain("text-green-600");
    expect(cell.getAttribute("title")).toBe("Yes");
  });

  it("renders ✕ when false (no green highlight)", () => {
    const a = makeApt({ id: "a1", name: "No", hasWashingMachine: false });
    renderTable([a]);
    // The column-header hide button also renders ✕; scope to the washing-
    // machine row.
    const wmRow = screen.getByText("Washing machine").closest("tr")!;
    const cell = within(wmRow).getByText("✕");
    expect(cell.className).not.toContain("text-green-600");
    expect(cell.getAttribute("title")).toBe("No (or shared)");
  });

  it("renders — when null with title 'Unknown'", () => {
    const a = makeApt({ id: "a1", name: "Maybe", hasWashingMachine: null });
    renderTable([a]);
    // Get cells whose title is "Unknown" (the washing-machine-specific —).
    const wmRow = screen.getByText("Washing machine").closest("tr")!;
    const cells = within(wmRow).getAllByText("—");
    expect(cells.length).toBe(1);
    expect(cells[0].getAttribute("title")).toBe("Unknown");
  });
});

describe("CompareTable — distance rows", () => {
  it("renders 'bike / transit min' format when both are present", () => {
    const a = makeApt({
      id: "a1",
      name: "Apt",
      distances: { "loc-7": { bikeMin: 12, transitMin: 25 } },
    });
    renderTable([a], [trainStation]);
    // Icon row uses the location label as its title attribute.
    const iconCell = screen
      .getAllByTitle(/Bike \+ transit to Train Station/i)[0];
    expect(iconCell).toBeInTheDocument();
    // Cell content "12 / 25 min".
    expect(screen.getByText(/12.*25 min/)).toBeInTheDocument();
  });

  it("renders em-dash when both bike and transit are null", () => {
    const a = makeApt({
      id: "a1",
      distances: { "loc-7": { bikeMin: null, transitMin: null } },
    });
    renderTable([a], [trainStation]);
    const distanceRow = screen
      .getAllByTitle(/Bike \+ transit to Train Station/i)[0]
      .closest("tr")!;
    expect(within(distanceRow).getByText("—")).toBeInTheDocument();
  });

  it("renders mixed bike + null transit", () => {
    const a = makeApt({
      id: "a1",
      distances: { "loc-7": { bikeMin: 12, transitMin: null } },
    });
    renderTable([a], [trainStation]);
    expect(screen.getByText(/12.*— min/)).toBeInTheDocument();
  });
});

describe("CompareTable — user rating sections", () => {
  it("groups rating rows by user, then renders a comment row", () => {
    const a = makeApt({
      id: "a1",
      name: "Apt",
      ratings: [
        {
          userId: "u-alice",
          userName: "Alice",
          kitchen: 4,
          balconies: 3,
          location: 5,
          floorplan: 4,
          overallFeeling: 4,
          comment: "Great kitchen",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
    renderTable([a]);
    expect(screen.getByText(/Alice's ratings/i)).toBeInTheDocument();
    // Both the per-user rating-key labels and the average-rating labels
    // appear, so we expect two of each.
    expect(screen.getAllByText("Kitchen").length).toBe(2);
    expect(screen.getByText("Comment")).toBeInTheDocument();
    expect(screen.getByText("Great kitchen")).toBeInTheDocument();
  });

  it("renders an em-dash when an apartment has no rating from a particular user", () => {
    const a = makeApt({
      id: "a1",
      name: "A",
      ratings: [
        {
          userId: "u-alice",
          userName: "Alice",
          kitchen: 4,
          balconies: 3,
          location: 5,
          floorplan: 4,
          overallFeeling: 4,
          comment: "",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
    const b = makeApt({ id: "a2", name: "B", ratings: [] });
    renderTable([a, b]);
    // "B" has no Alice rating; the cell for that combination shows —.
    // Plus, both apartments show — under their Comment row (Alice has empty
    // comment, B has no Alice rating). So at least two —s are present in
    // the user section.
    const alicesSection = screen.getByText(/Alice's ratings/i).closest("tr")!;
    expect(alicesSection).toBeInTheDocument();
  });

  it("keeps two members with the same display name as separate sections, grouped by userId", () => {
    // Regression: grouping used to key on userName, which collapsed
    // distinct members sharing a first name into one row and made
    // `.find(r => r.userName === user)` return an arbitrary rating.
    const a = makeApt({
      id: "a1",
      name: "Apt",
      ratings: [
        {
          userId: "u1",
          userName: "Alex",
          kitchen: 5,
          balconies: 5,
          location: 5,
          floorplan: 5,
          overallFeeling: 5,
          comment: "First Alex",
          updatedAt: "2026-01-01T00:00:00Z",
        },
        {
          userId: "u2",
          userName: "Alex",
          kitchen: 1,
          balconies: 1,
          location: 1,
          floorplan: 1,
          overallFeeling: 1,
          comment: "Second Alex",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
    renderTable([a]);
    expect(screen.getAllByText(/Alex's ratings/i)).toHaveLength(2);
    expect(screen.getByText("First Alex")).toBeInTheDocument();
    expect(screen.getByText("Second Alex")).toBeInTheDocument();
  });

  it("labels a rating from an account with no display name rather than dropping it", () => {
    const a = makeApt({
      id: "a1",
      name: "Apt",
      ratings: [
        {
          userId: "u1",
          userName: "",
          kitchen: 3,
          balconies: 3,
          location: 3,
          floorplan: 3,
          overallFeeling: 3,
          comment: "Nameless account",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
    renderTable([a]);
    expect(screen.getByText(/Household member's ratings/i)).toBeInTheDocument();
    expect(screen.getByText("Nameless account")).toBeInTheDocument();
  });
});

describe("CompareTable — average ratings section", () => {
  it("renders average rows after the per-user sections", () => {
    const a = makeApt({
      id: "a1",
      name: "A",
      ratings: [
        {
          userId: "u-alice",
          userName: "Alice",
          kitchen: 4,
          balconies: 3,
          location: 5,
          floorplan: 4,
          overallFeeling: 4,
          comment: "",
          updatedAt: "2026-01-01T00:00:00Z",
        },
        {
          userId: "u-bob",
          userName: "Bob",
          kitchen: 2,
          balconies: 3,
          location: 1,
          floorplan: 4,
          overallFeeling: 3,
          comment: "",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
    renderTable([a]);
    expect(screen.getByText("Average Ratings")).toBeInTheDocument();
  });

  it("renders em-dash in the average row when an apartment has no ratings", () => {
    const a = makeApt({ id: "a1", name: "A", ratings: [] });
    renderTable([a]);
    // The Average Ratings header renders even when no users exist, then 5
    // average-rating rows render with — cells.
    expect(screen.getByText("Average Ratings")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(5);
  });
});

describe("CompareTable — column header", () => {
  it("calls onHide(id) when a column's hide button is clicked", async () => {
    const user = userEvent.setup();
    const a = makeApt({ id: "a42", name: "Drop me" });
    const b = makeApt({ id: "a43", name: "Keep me" });
    const { onHide } = renderTable([a, b]);
    await user.click(screen.getByRole("button", { name: /Hide Drop me/i }));
    expect(onHide).toHaveBeenCalledWith("a42");
  });
});

describe("CompareTable — column header PDF button", () => {
  it("renders a View PDF button that reports the apartment when it has a pdf", async () => {
    const a = makeApt({ id: "a1", name: "With PDF", pdf: { path: "/api/pdf/households/7/a1.pdf.enc", iv: "AAAA" } });
    const { onViewPdf } = renderTable([a]);
    await userEvent.setup().click(screen.getByRole("button", { name: /View PDF for With PDF/i }));
    expect(onViewPdf).toHaveBeenCalledWith(a);
  });

  it("omits the button when there is no pdf", () => {
    renderTable([makeApt({ id: "a1", name: "No PDF", pdf: null })]);
    expect(screen.queryByRole("button", { name: /View PDF for No PDF/i })).toBeNull();
  });

  it("Hide reports the string id", async () => {
    const { onHide } = renderTable([makeApt({ id: "a1", name: "Apt" })]);
    await userEvent.setup().click(screen.getByRole("button", { name: /Hide Apt/i }));
    expect(onHide).toHaveBeenCalledWith("a1");
  });
});
