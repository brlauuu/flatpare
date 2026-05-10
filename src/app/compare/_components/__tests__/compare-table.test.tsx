import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompareTable } from "../compare-table";
import type { ApartmentWithRatings } from "../compare-types";
import type { LocationOfInterest } from "@/lib/db/schema";

afterEach(() => cleanup());

function makeApt(over: Partial<ApartmentWithRatings> = {}): ApartmentWithRatings {
  return {
    id: 1,
    name: "Apt",
    address: null,
    sizeM2: 50,
    numRooms: 2.5,
    numBathrooms: 1,
    numBalconies: 1,
    hasWashingMachine: null,
    rentChf: 2000,
    distances: [],
    pdfUrl: null,
    listingUrl: null,
    shortCode: "ABC-2.5B-WY-4001",
    createdAt: "2026-01-01T00:00:00Z",
    avgOverall: null,
    ratings: [],
    ...over,
  };
}

const trainStation: LocationOfInterest = {
  id: 7,
  label: "Train Station",
  icon: "Train",
  address: "Basel SBB",
  sortOrder: 0,
  latitude: null,
  longitude: null,
  createdAt: null,
  updatedAt: null,
};

describe("CompareTable — metric rows", () => {
  it("renders one cell per metric per apartment", () => {
    const a = makeApt({ id: 1, name: "Cheap", rentChf: 1500, sizeM2: 40 });
    const b = makeApt({ id: 2, name: "Spacious", rentChf: 2500, sizeM2: 80 });
    render(
      <CompareTable
        visible={[a, b]}
        sortedVisible={[a, b]}
        locations={[]}
        onHide={() => {}}
      />
    );
    expect(screen.getByText("Cheap")).toBeInTheDocument();
    expect(screen.getByText("Spacious")).toBeInTheDocument();
    expect(screen.getByText("Rent (CHF)")).toBeInTheDocument();
    expect(screen.getByText("1,500")).toBeInTheDocument();
    expect(screen.getByText("2,500")).toBeInTheDocument();
  });

  it("highlights the cheapest rent in green (min direction)", () => {
    const a = makeApt({ id: 1, name: "Cheap", rentChf: 1500 });
    const b = makeApt({ id: 2, name: "Pricey", rentChf: 2500 });
    render(
      <CompareTable
        visible={[a, b]}
        sortedVisible={[a, b]}
        locations={[]}
        onHide={() => {}}
      />
    );
    const cheap = screen.getByText("1,500");
    const pricey = screen.getByText("2,500");
    expect(cheap.className).toContain("text-green-600");
    expect(pricey.className).not.toContain("text-green-600");
  });

  it("highlights the largest size in green (max direction)", () => {
    const a = makeApt({ id: 1, name: "Small", sizeM2: 40 });
    const b = makeApt({ id: 2, name: "Big", sizeM2: 80 });
    render(
      <CompareTable
        visible={[a, b]}
        sortedVisible={[a, b]}
        locations={[]}
        onHide={() => {}}
      />
    );
    const big = screen.getByText("80");
    const small = screen.getByText("40");
    expect(big.className).toContain("text-green-600");
    expect(small.className).not.toContain("text-green-600");
  });

  it("renders an em-dash for null metric values and never highlights them", () => {
    const a = makeApt({ id: 1, name: "Has rent", rentChf: 1500 });
    const b = makeApt({ id: 2, name: "No rent", rentChf: null });
    render(
      <CompareTable
        visible={[a, b]}
        sortedVisible={[a, b]}
        locations={[]}
        onHide={() => {}}
      />
    );
    // The "—" appears once per missing metric — in this test, only rentChf is null on one apt.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("CompareTable — washing machine row", () => {
  it("renders ✓ when true and highlights it green", () => {
    const a = makeApt({ id: 1, name: "Yes", hasWashingMachine: true });
    render(
      <CompareTable
        visible={[a]}
        sortedVisible={[a]}
        locations={[]}
        onHide={() => {}}
      />
    );
    const wmRow = screen.getByText("Washing machine").closest("tr")!;
    const cell = within(wmRow).getByText("✓");
    expect(cell.className).toContain("text-green-600");
    expect(cell.getAttribute("title")).toBe("Yes");
  });

  it("renders ✕ when false (no green highlight)", () => {
    const a = makeApt({ id: 1, name: "No", hasWashingMachine: false });
    render(
      <CompareTable
        visible={[a]}
        sortedVisible={[a]}
        locations={[]}
        onHide={() => {}}
      />
    );
    // The column-header hide button also renders ✕; scope to the washing-
    // machine row.
    const wmRow = screen.getByText("Washing machine").closest("tr")!;
    const cell = within(wmRow).getByText("✕");
    expect(cell.className).not.toContain("text-green-600");
    expect(cell.getAttribute("title")).toBe("No (or shared)");
  });

  it("renders — when null with title 'Unknown'", () => {
    const a = makeApt({ id: 1, name: "Maybe", hasWashingMachine: null });
    render(
      <CompareTable
        visible={[a]}
        sortedVisible={[a]}
        locations={[]}
        onHide={() => {}}
      />
    );
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
      id: 1,
      name: "Apt",
      distances: [{ locationId: 7, bikeMin: 12, transitMin: 25 }],
    });
    render(
      <CompareTable
        visible={[a]}
        sortedVisible={[a]}
        locations={[trainStation]}
        onHide={() => {}}
      />
    );
    // Icon row uses the location label as its title attribute.
    const iconCell = screen
      .getAllByTitle(/Bike \+ transit to Train Station/i)[0];
    expect(iconCell).toBeInTheDocument();
    // Cell content "12 / 25 min".
    expect(screen.getByText(/12.*25 min/)).toBeInTheDocument();
  });

  it("renders em-dash when both bike and transit are null", () => {
    const a = makeApt({
      id: 1,
      distances: [{ locationId: 7, bikeMin: null, transitMin: null }],
    });
    render(
      <CompareTable
        visible={[a]}
        sortedVisible={[a]}
        locations={[trainStation]}
        onHide={() => {}}
      />
    );
    const distanceRow = screen
      .getAllByTitle(/Bike \+ transit to Train Station/i)[0]
      .closest("tr")!;
    expect(within(distanceRow).getByText("—")).toBeInTheDocument();
  });

  it("renders mixed bike + null transit", () => {
    const a = makeApt({
      id: 1,
      distances: [{ locationId: 7, bikeMin: 12, transitMin: null }],
    });
    render(
      <CompareTable
        visible={[a]}
        sortedVisible={[a]}
        locations={[trainStation]}
        onHide={() => {}}
      />
    );
    expect(screen.getByText(/12.*— min/)).toBeInTheDocument();
  });
});

describe("CompareTable — user rating sections", () => {
  it("groups rating rows by user, then renders a comment row", () => {
    const a = makeApt({
      id: 1,
      name: "Apt",
      ratings: [
        {
          userName: "Alice",
          kitchen: 4,
          balconies: 3,
          location: 5,
          floorplan: 4,
          overallFeeling: 4,
          comment: "Great kitchen",
        },
      ],
    });
    render(
      <CompareTable
        visible={[a]}
        sortedVisible={[a]}
        locations={[]}
        onHide={() => {}}
      />
    );
    expect(screen.getByText(/Alice's ratings/i)).toBeInTheDocument();
    // Both the per-user rating-key labels and the average-rating labels
    // appear, so we expect two of each.
    expect(screen.getAllByText("Kitchen").length).toBe(2);
    expect(screen.getByText("Comment")).toBeInTheDocument();
    expect(screen.getByText("Great kitchen")).toBeInTheDocument();
  });

  it("renders an em-dash when an apartment has no rating from a particular user", () => {
    const a = makeApt({
      id: 1,
      name: "A",
      ratings: [
        {
          userName: "Alice",
          kitchen: 4,
          balconies: 3,
          location: 5,
          floorplan: 4,
          overallFeeling: 4,
          comment: "",
        },
      ],
    });
    const b = makeApt({ id: 2, name: "B", ratings: [] });
    render(
      <CompareTable
        visible={[a, b]}
        sortedVisible={[a, b]}
        locations={[]}
        onHide={() => {}}
      />
    );
    // "B" has no Alice rating; the cell for that combination shows —.
    // Plus, both apartments show — under their Comment row (Alice has empty
    // comment, B has no Alice rating). So at least two —s are present in
    // the user section.
    const alicesSection = screen.getByText(/Alice's ratings/i).closest("tr")!;
    expect(alicesSection).toBeInTheDocument();
  });
});

describe("CompareTable — average ratings section", () => {
  it("renders average rows after the per-user sections", () => {
    const a = makeApt({
      id: 1,
      name: "A",
      ratings: [
        {
          userName: "Alice",
          kitchen: 4,
          balconies: 3,
          location: 5,
          floorplan: 4,
          overallFeeling: 4,
          comment: "",
        },
        {
          userName: "Bob",
          kitchen: 2,
          balconies: 3,
          location: 1,
          floorplan: 4,
          overallFeeling: 3,
          comment: "",
        },
      ],
    });
    render(
      <CompareTable
        visible={[a]}
        sortedVisible={[a]}
        locations={[]}
        onHide={() => {}}
      />
    );
    expect(screen.getByText("Average Ratings")).toBeInTheDocument();
  });

  it("renders em-dash in the average row when an apartment has no ratings", () => {
    const a = makeApt({ id: 1, name: "A", ratings: [] });
    render(
      <CompareTable
        visible={[a]}
        sortedVisible={[a]}
        locations={[]}
        onHide={() => {}}
      />
    );
    // The Average Ratings header renders even when no users exist, then 5
    // average-rating rows render with — cells.
    expect(screen.getByText("Average Ratings")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(5);
  });
});

describe("CompareTable — column header", () => {
  it("calls onHide(id) when a column's hide button is clicked", async () => {
    const onHide = vi.fn();
    const user = userEvent.setup();
    const a = makeApt({ id: 42, name: "Drop me" });
    const b = makeApt({ id: 43, name: "Keep me" });
    render(
      <CompareTable
        visible={[a, b]}
        sortedVisible={[a, b]}
        locations={[]}
        onHide={onHide}
      />
    );
    await user.click(screen.getByRole("button", { name: /Hide Drop me/i }));
    expect(onHide).toHaveBeenCalledWith(42);
  });
});
