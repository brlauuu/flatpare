import { describe, it, expect } from "vitest";
import {
  byDay,
  cadenceDue,
  dailyChart,
  dayRange,
  checkReason,
  emailCounts,
  serviceLines,
  EMAIL_TOP,
  needsCheck,
  renderEmail,
  renderHtml,
  summarize,
  totals,
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

  it("leads with the totals over every active household", () => {
    expect(totals(REPORT.lines)).toEqual({
      active: 2,
      check: 1,
      spends: 7,
      paid: 6,
      "parse-pdf": 47,
      geocode: 9,
      distance: 4,
      "check-listing": 0,
    });
    const { html, text } = renderEmail(REPORT);
    expect(html).toContain(">47</div><div style=\"font-size:12px;color:#555555\">PDF reads</div>");
    expect(text).toContain("Active households: 2\nTo check: 1\nCredits spent: 7\nPDF reads: 47");
  });

  it("says why each marked household is marked", () => {
    expect(checkReason(REPORT.lines[1])).toBe("40 PDF reads and 0 address lookups against 0 paid processings");
    const { html, text } = renderEmail(REPORT);
    expect(html).toContain("<b>Household 2</b>: 40 PDF reads and 0 address lookups against 0 paid processings");
    expect(text).toContain("- household 2: 40 PDF reads and 0 address lookups against 0 paid processings");
    expect(renderEmail({ ...REPORT, lines: [REPORT.lines[0]] }).text).toContain("No household is marked to check.");
  });

  it("lists the most active households first, at most ten, and points to the page for the rest", () => {
    const many = Array.from({ length: EMAIL_TOP + 3 }, (_, i) => ({
      ...REPORT.lines[0],
      id: i + 1,
      calls: { ...REPORT.lines[0].calls, "parse-pdf": i },
    }));
    const { html, text } = renderEmail({ ...REPORT, lines: many });
    expect(text).toContain(`Most active (household: credits spent, PDF reads, address lookups, credits left):\n- 13: 7, 12, 9, 28`);
    expect(text).not.toContain("- 3: ");
    expect(html).toContain("And 3 more in the attached report.");
  });

  it("holds no SVG and no stylesheet, which email clients drop", () => {
    const { html } = renderEmail(REPORT);
    expect(html).not.toMatch(/<svg|<style/);
    expect(html).toContain("The attached page is the full report");
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

// 2026-11-17: the two outside limits, Resend's quota and the AI Gateway's
// prepaid balance, in the email and the page.
describe("emailCounts", () => {
  it("counts this UTC month's and today's sends from Resend's timestamps", () => {
    const now = new Date("2026-11-17T06:00:00Z");
    const rows = [
      { created_at: "2026-11-17 05:59:00.000000+00" },
      { created_at: "2026-11-17 00:00:01.000000+00" },
      { created_at: "2026-11-16 23:59:59.000000+00" },
      { created_at: "2026-11-01 00:00:00.000000+00" },
      { created_at: "2026-10-31 23:59:59.000000+00" },
      {},
    ];
    expect(emailCounts(rows, now)).toEqual({ month: 4, today: 2 });
  });
});

describe("serviceLines", () => {
  const ok = { emails: { month: 120, today: 9 }, gateway: { balance: 42.5, used: 7.25 } };

  it("shows nothing when the report carries no services (the terminal forms)", () => {
    expect(serviceLines(undefined)).toEqual([]);
  });

  it("states the counts against the free plan and the balance in dollars", () => {
    expect(serviceLines(ok)).toEqual([
      { label: "Emails sent this month (Resend)", value: "120 of 3,000 on the free plan", warn: false },
      { label: "Emails sent today (UTC)", value: "9 of 100", warn: false },
      { label: "AI credit left (AI Gateway)", value: "$42.50 ($7.25 used to date)", warn: false },
    ]);
  });

  it("warns from 80% of either email limit and below $5 of AI credit", () => {
    const warns = serviceLines({ emails: { month: 2400, today: 80 }, gateway: { balance: 4.99, used: 1 } });
    expect(warns.map((l) => l.warn)).toEqual([true, true, true]);
    const under = serviceLines({ emails: { month: 2399, today: 79 }, gateway: { balance: 5, used: 1 } });
    expect(under.map((l) => l.warn)).toEqual([false, false, false]);
  });

  it("says why a number is missing instead of failing", () => {
    const lines = serviceLines({
      emails: { unavailable: "RESEND_API_KEY is not set" },
      gateway: { unavailable: "AI_GATEWAY_API_KEY is not set" },
    });
    expect(lines.map((l) => l.value)).toEqual([
      "not available: RESEND_API_KEY is not set",
      "not available: AI_GATEWAY_API_KEY is not set",
    ]);
    expect(lines.every((l) => !l.warn)).toBe(true);
  });

  it("puts the limits in the email, its text part and the page, and flags a close one in the subject", () => {
    const { html, text, subject } = renderEmail({ ...REPORT, services: ok });
    expect(html).toContain("Limits");
    expect(html).toContain("120 of 3,000 on the free plan");
    expect(text).toContain("- AI credit left (AI Gateway): $42.50 ($7.25 used to date)");
    expect(subject).not.toContain("a limit is close");
    expect(renderHtml({ ...REPORT, services: ok })).toContain("9 of 100");

    const close = renderEmail({ ...REPORT, services: { ...ok, gateway: { balance: 1, used: 50 } } });
    expect(close.subject).toBe("Flatpare usage, last 7 day(s): 2 active, 1 to check, a limit is close");
    expect(close.text).toContain("$1.00 ($50.00 used to date) (close to the limit)");
    expect(close.html).toMatch(/color:#c8102e;font-weight:600">AI credit left/);
  });

  it("leaves the email as it was when no services are passed", () => {
    expect(renderEmail(REPORT).html).not.toContain("Limits");
    expect(renderHtml(REPORT)).not.toContain("Limits");
  });
});
