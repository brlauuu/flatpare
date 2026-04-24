import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import ApartmentsPage from "../page";

const APARTMENTS = [
  {
    id: 1,
    name: "Sonnenweg 3",
    address: "Sonnenweg 3, 8001 Zürich",
    sizeM2: 60,
    numRooms: 2.5,
    rentChf: 2200,
    shortCode: "ABC-2.5B-WY-4057",
    avgOverall: null,
    myRating: null,
    createdAt: "2026-01-15T10:00:00Z",
  },
  {
    id: 2,
    name: "Bergstrasse 12",
    address: "Bergstrasse 12, 8032 Zürich",
    sizeM2: 45,
    numRooms: 2,
    rentChf: 1800,
    shortCode: "DEF-2B-W-4058",
    avgOverall: "3.5",
    myRating: 4,
    createdAt: "2026-03-20T10:00:00Z",
  },
  {
    id: 3,
    name: "Seeblick 7",
    address: null,
    sizeM2: 80,
    numRooms: 3.5,
    rentChf: null,
    shortCode: "GHI-3.5B-WY-4059",
    avgOverall: "4.5",
    myRating: null,
    createdAt: "2026-02-10T10:00:00Z",
  },
];

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(APARTMENTS),
  } as Response);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Apartments page — view toggle", () => {
  it("defaults to grid view when no preference is stored", async () => {
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });

    expect(document.querySelector('[data-view="grid"]')).toBeInTheDocument();
    expect(document.querySelector('[data-view="list"]')).toBeNull();
    expect(
      screen.getByRole("button", { name: /Grid view/ })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("uses the stored preference from localStorage on mount", async () => {
    localStorage.setItem("flatpare-apartments-view", "list");
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });

    expect(document.querySelector('[data-view="list"]')).toBeInTheDocument();
    expect(document.querySelector('[data-view="grid"]')).toBeNull();
    expect(
      screen.getByRole("button", { name: /List view/ })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking the toggle switches the layout and persists the choice", async () => {
    const user = userEvent.setup();
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });

    // Default grid
    expect(document.querySelector('[data-view="grid"]')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /List view/ }));
    expect(document.querySelector('[data-view="list"]')).toBeInTheDocument();
    expect(localStorage.getItem("flatpare-apartments-view")).toBe("list");

    await user.click(screen.getByRole("button", { name: /Grid view/ }));
    expect(document.querySelector('[data-view="grid"]')).toBeInTheDocument();
    expect(localStorage.getItem("flatpare-apartments-view")).toBe("grid");
  });
});

describe("Apartments page — sort", () => {
  it("defaults to newest first (createdAt desc) when no preference is stored", async () => {
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });

    // createdAt desc: Bergstrasse (2026-03-20), Seeblick (2026-02-10), Sonnenweg (2026-01-15)
    const order = Array.from(document.querySelectorAll("h3")).map(
      (el) => el.textContent
    );
    expect(order).toEqual(["Bergstrasse 12", "Seeblick 7", "Sonnenweg 3"]);
  });

  it("reads sort field and direction from localStorage on mount", async () => {
    localStorage.setItem("flatpare-apartments-sort-field", "rentChf");
    localStorage.setItem("flatpare-apartments-sort-direction", "asc");

    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });

    // Ascending by rentChf: Bergstrasse (1800), Sonnenweg (2200), Seeblick (null last)
    const order = Array.from(document.querySelectorAll("h3")).map(
      (el) => el.textContent
    );
    expect(order).toEqual(["Bergstrasse 12", "Sonnenweg 3", "Seeblick 7"]);
  });

  it("falls back to defaults when localStorage has invalid values", async () => {
    localStorage.setItem("flatpare-apartments-sort-field", "bogus");
    localStorage.setItem("flatpare-apartments-sort-direction", "sideways");

    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });

    // Defaults: createdAt desc
    const order = Array.from(document.querySelectorAll("h3")).map(
      (el) => el.textContent
    );
    expect(order).toEqual(["Bergstrasse 12", "Seeblick 7", "Sonnenweg 3"]);
  });

  it("changing the sort field re-orders the list and persists to localStorage", async () => {
    const user = userEvent.setup();
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });

    // Open the field selector and pick "Price".
    await user.click(screen.getByRole("combobox", { name: /Sort by/i }));
    await user.click(screen.getByRole("option", { name: "Price" }));

    // Default direction is desc → highest price first: Sonnenweg (2200),
    // Bergstrasse (1800), Seeblick (null last).
    await waitFor(() => {
      const order = Array.from(document.querySelectorAll("h3")).map(
        (el) => el.textContent
      );
      expect(order).toEqual(["Sonnenweg 3", "Bergstrasse 12", "Seeblick 7"]);
    });

    expect(localStorage.getItem("flatpare-apartments-sort-field")).toBe("rentChf");
  });

  it("clicking the direction toggle flips the order and persists", async () => {
    const user = userEvent.setup();
    // Start with rentChf desc so the toggle has something to flip.
    localStorage.setItem("flatpare-apartments-sort-field", "rentChf");
    localStorage.setItem("flatpare-apartments-sort-direction", "desc");

    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });

    // desc: Sonnenweg (2200), Bergstrasse (1800), Seeblick (null)
    let order = Array.from(document.querySelectorAll("h3")).map(
      (el) => el.textContent
    );
    expect(order).toEqual(["Sonnenweg 3", "Bergstrasse 12", "Seeblick 7"]);

    await user.click(screen.getByRole("button", { name: /Descending/i }));

    // asc: Bergstrasse (1800), Sonnenweg (2200), Seeblick (null last)
    await waitFor(() => {
      order = Array.from(document.querySelectorAll("h3")).map(
        (el) => el.textContent
      );
      expect(order).toEqual(["Bergstrasse 12", "Sonnenweg 3", "Seeblick 7"]);
    });

    expect(localStorage.getItem("flatpare-apartments-sort-direction")).toBe("asc");
  });

  it("renders exactly 6 sort field options in the list-page Select", async () => {
    const user = userEvent.setup();
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("combobox", { name: /Sort by/i }));
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(6);
    const labels = options.map((o) => o.textContent);
    expect(labels).toEqual([
      "Date added",
      "Price",
      "Size",
      "Rooms",
      "Avg rating",
      "Short code",
    ]);
  });
});

describe("Apartments page — search", () => {
  it("renders an empty search input on mount and shows all apartments", async () => {
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    const input = screen.getByRole("textbox", { name: /Search apartments/i });
    expect((input as HTMLInputElement).value).toBe("");
    expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    expect(screen.getByText("Seeblick 7")).toBeInTheDocument();
  });

  it("filters by name substring, case-insensitive", async () => {
    const user = userEvent.setup();
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    await user.type(
      screen.getByRole("textbox", { name: /Search apartments/i }),
      "berg"
    );
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    expect(screen.queryByText("Sonnenweg 3")).toBeNull();
    expect(screen.queryByText("Seeblick 7")).toBeNull();
  });

  it("filters by short code, case-insensitive", async () => {
    const user = userEvent.setup();
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    await user.type(
      screen.getByRole("textbox", { name: /Search apartments/i }),
      "GHI"
    );
    await waitFor(() => {
      expect(screen.getByText("Seeblick 7")).toBeInTheDocument();
    });
    expect(screen.queryByText("Sonnenweg 3")).toBeNull();
    expect(screen.queryByText("Bergstrasse 12")).toBeNull();
  });

  it("filters by address", async () => {
    const user = userEvent.setup();
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    await user.type(
      screen.getByRole("textbox", { name: /Search apartments/i }),
      "zürich"
    );
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });
    expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    expect(screen.queryByText("Seeblick 7")).toBeNull();
  });

  it("treats null address as empty — 'null' query matches nothing", async () => {
    const user = userEvent.setup();
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    await user.type(
      screen.getByRole("textbox", { name: /Search apartments/i }),
      "null"
    );
    await waitFor(() => {
      expect(screen.getByText(/No apartments match "null"/i)).toBeInTheDocument();
    });
    expect(screen.queryByText("Sonnenweg 3")).toBeNull();
    expect(screen.queryByText("Bergstrasse 12")).toBeNull();
    expect(screen.queryByText("Seeblick 7")).toBeNull();
  });

  it("renders empty-result state when the query matches no apartments", async () => {
    const user = userEvent.setup();
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    await user.type(
      screen.getByRole("textbox", { name: /Search apartments/i }),
      "xyz"
    );
    await waitFor(() => {
      expect(screen.getByText(/No apartments match "xyz"/i)).toBeInTheDocument();
    });
  });

  it("'Show all apartments' button in the empty-result state resets the query", async () => {
    const user = userEvent.setup();
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    await user.type(
      screen.getByRole("textbox", { name: /Search apartments/i }),
      "xyz"
    );
    await waitFor(() => {
      expect(screen.getByText(/No apartments match "xyz"/i)).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: /Show all apartments/i })
    );
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });
    expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    expect(screen.getByText("Seeblick 7")).toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: /Search apartments/i });
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("inline Clear (X) button in the input resets the query", async () => {
    const user = userEvent.setup();
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    await user.type(
      screen.getByRole("textbox", { name: /Search apartments/i }),
      "berg"
    );
    await waitFor(() => {
      expect(screen.queryByText("Sonnenweg 3")).toBeNull();
    });
    await user.click(screen.getByRole("button", { name: /Clear search/i }));
    await waitFor(() => {
      expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    });
    expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    expect(screen.getByText("Seeblick 7")).toBeInTheDocument();
  });

  it("whitespace-only query behaves as empty", async () => {
    const user = userEvent.setup();
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    await user.type(
      screen.getByRole("textbox", { name: /Search apartments/i }),
      "  "
    );
    expect(screen.getByText("Sonnenweg 3")).toBeInTheDocument();
    expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    expect(screen.getByText("Seeblick 7")).toBeInTheDocument();
    expect(screen.queryByText(/No apartments match/i)).toBeNull();
  });

  it("composes with sort: search narrows first, sort applies after", async () => {
    const user = userEvent.setup();
    localStorage.setItem("flatpare-apartments-sort-field", "rentChf");
    localStorage.setItem("flatpare-apartments-sort-direction", "asc");
    render(<ApartmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    await user.type(
      screen.getByRole("textbox", { name: /Search apartments/i }),
      "berg"
    );
    await waitFor(() => {
      expect(screen.getByText("Bergstrasse 12")).toBeInTheDocument();
    });
    expect(screen.queryByText("Sonnenweg 3")).toBeNull();
    expect(screen.queryByText("Seeblick 7")).toBeNull();
  });
});
