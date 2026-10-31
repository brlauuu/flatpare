import { describe, it, expect } from "vitest";
import {
  byDay,
  cadenceDue,
  dailyChart,
  dayRange,
  needsCheck,
  renderEmail,
  renderHtml,
  summarize,
} from "../../../scripts/usage-report-lib.mjs";

// #431: the host's usage report as a page and an email. The pure half of
// scripts/usage-report.mjs; the database and Resend calls stay in the script.

const HOUSEHOLDS = [
  { id: 1, granted: 40, spent: 12, held: 5 },
  { id: 2, granted: 40, spent: 3, held: 0 },
  { id: 3, granted: 0, spent: 0, held: 0 },
];
const CALLS = [
  { household_id: 1, endpoint: "parse-pdf", n: 7 },
  { household_id: 1, endpoint: "geocode", n: 9 },
  { household_id: 2, endpoint: "parse-pdf", n: 40 },
  { household_id: 2, endpoint: "distance", n: 4 },
];
const SPENDS = [
  { household_id: 1, kind: "first", n: 6 },
  { household_id: 1, kind: "recompute", n: 1 },
];

describe("needsCheck", () => {
  it("marks PDF reads past twice the paid processings plus 5", () => {
    expect(needsCheck({ pdfReads: 25, geocodes: 0, paidProcessings: 10 })).toBe(false);
    expect(needsCheck({ pdfReads: 26, geocodes: 0, paidProcessings: 10 })).toBe(true);
  });

  it("marks geocodes past three times the paid processings plus 20", () => {
    expect(needsCheck({ pdfReads: 0, geocodes: 50, paidProcessings: 10 })).toBe(false);
    expect(needsCheck({ pdfReads: 0, geocodes: 51, paidProcessings: 10 })).toBe(true);
  });
});

describe("summarize", () => {
  it("gives one line per active household, with zeros filled and the mark", () => {
    const lines = summarize(HOUSEHOLDS, CALLS, SPENDS);
    expect(lines.map((l) => l.id)).toEqual([1, 2]);
    expect(lines[0]).toEqual({
      id: 1,
      held: 5,
      granted: 40,
      spent: 12,
      spends: { first: 6, reprocess: 0, recompute: 1 },
      calls: { "parse-pdf": 7, geocode: 9, distance: 0, "check-listing": 0 },
      check: false,
    });
    // A recompute is not a paid processing: 40 reads against 0 is marked.
    expect(lines[1].check).toBe(true);
  });
});

describe("byDay and dayRange", () => {
  it("groups by household and day", () => {
    const cells = byDay(
      [{ household_id: 1, day: "2026-10-01", endpoint: "geocode", n: 2 }],
      [{ household_id: 1, day: "2026-10-02", kind: "first", n: 1 }]
    );
    expect(cells.get(1)?.get("2026-10-01")).toEqual({ calls: { geocode: 2 }, spends: {} });
    expect(cells.get(1)?.get("2026-10-02")).toEqual({ calls: {}, spends: { first: 1 } });
  });

  it("lists every day across a month end, inclusive", () => {
    expect(dayRange("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});

describe("dailyChart", () => {
  it("draws two bars a day, PDF reads with geocodes against credits spent", () => {
    const cells = new Map([
      ["2026-10-01", { calls: { "parse-pdf": 2, geocode: 3, distance: 50 }, spends: { first: 1, reprocess: 1 } }],
    ]);
    const svg = dailyChart(["2026-10-01", "2026-10-02"], cells);
    expect(svg.match(/class="calls"/g)).toHaveLength(2);
    expect(svg.match(/class="spends"/g)).toHaveLength(2);
    // Distance calls are not what the mark weighs, so they are not drawn.
    expect(svg).toContain("2026-10-01: 5 PDF reads and geocodes, 2 credits spent");
    expect(svg).toContain(">5</text>");
  });
});

const REPORT = {
  target: "Turso (db.example.turso.io)",
  days: 7,
  chartDays: 30,
  generatedAt: "2026-10-31T06:00:00Z",
  lines: summarize(HOUSEHOLDS, CALLS, SPENDS),
  daily: new Map(),
  firstDay: "2026-10-02",
  lastDay: "2026-10-31",
};

describe("renderHtml", () => {
  it("is one self-contained page: no script and nothing loaded from elsewhere", () => {
    const page = renderHtml(REPORT);
    expect(page).not.toMatch(/<script|<link|https?:\/\//i);
    expect(page).toContain("Database: Turso (db.example.turso.io). Last 7 day(s)");
  });

  it("highlights the marked household and charts every active one", () => {
    const page = renderHtml(REPORT);
    expect(page.match(/<tr class="check">/g)).toHaveLength(1);
    expect(page.match(/<svg class="chart"/g)).toHaveLength(2);
    expect(page).toContain("Household 2 <span class=\"badge\">check</span>");
  });

  it("says so when nothing happened, and draws no chart", () => {
    const page = renderHtml({ ...REPORT, lines: [] });
    expect(page).toContain("No household made a call or spent a credit in this window.");
    expect(page).not.toContain("<svg");
  });

  it("escapes the database name", () => {
    expect(renderHtml({ ...REPORT, target: "<b>x</b>" })).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

describe("renderEmail", () => {
  it("counts the active and marked households in the subject", () => {
    expect(renderEmail(REPORT).subject).toBe("Flatpare usage, last 7 day(s): 2 active, 1 to check");
    expect(renderEmail({ ...REPORT, lines: [] }).subject).toBe("Flatpare usage, last 7 day(s): 0 active");
  });

  it("holds the table inline, with no SVG, and the same lines as text", () => {
    const { html, text } = renderEmail(REPORT);
    expect(html).not.toContain("<svg");
    expect(html).toContain("<td");
    expect(text).toContain("household 2: held 0, credits 3/40, spent 0/0/0, calls 40/0/4/0 CHECK");
  });
});

describe("cadenceDue", () => {
  // 2026-11-02 is a Monday, 2026-11-01 a Sunday and the 1st.
  it("sends daily every day, weekly on Mondays, monthly on the 1st (UTC)", () => {
    const sunday1st = new Date("2026-11-01T06:00:00Z");
    const monday = new Date("2026-11-02T06:00:00Z");
    expect(cadenceDue("daily", monday)).toBe(true);
    expect(cadenceDue("weekly", monday)).toBe(true);
    expect(cadenceDue("weekly", sunday1st)).toBe(false);
    expect(cadenceDue("monthly", sunday1st)).toBe(true);
    expect(cadenceDue("monthly", monday)).toBe(false);
  });

  it("never sends for an unset or unknown cadence", () => {
    expect(cadenceDue(undefined, new Date("2026-11-02T06:00:00Z"))).toBe(false);
    expect(cadenceDue("hourly", new Date("2026-11-02T06:00:00Z"))).toBe(false);
  });
});
