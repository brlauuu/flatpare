// The pure half of scripts/usage-report.mjs (#431): the "check" rule, the
// shaping of query rows, the HTML page, the email and the cadence. No
// database, no network, no clock, so src/lib/__tests__/usage-report.test.ts
// can import it. The terminal report, the page and the email all mark
// households with the one rule below, so they cannot disagree.

export const ENDPOINTS = ["parse-pdf", "geocode", "distance", "check-listing"];
export const KINDS = ["first", "reprocess", "recompute"];

// Days a daily chart covers, at least: a daily email's window is one day,
// which would make its chart a single bar.
export const CHART_MIN_DAYS = 30;

// An honest household reads each PDF once per credit and geocodes a few times
// more (locations, retries, map upkeep), so these are loose on purpose: a mark
// is a reason to look, not a verdict.
export function needsCheck({ pdfReads, geocodes, paidProcessings }) {
  return pdfReads > 2 * paidProcessings + 5 || geocodes > 3 * paidProcessings + 20;
}

// households: { id, granted, spent, held }; calls: { household_id, endpoint, n };
// spends: { household_id, kind, n }. Returns one line per household with any
// activity in the window, in household order.
export function summarize(households, calls, spends) {
  const activity = new Map();
  const entry = (id) => {
    if (!activity.has(id)) activity.set(id, { calls: {}, spends: {} });
    return activity.get(id);
  };
  for (const r of calls) entry(Number(r.household_id)).calls[String(r.endpoint)] = Number(r.n);
  for (const r of spends) entry(Number(r.household_id)).spends[String(r.kind)] = Number(r.n);

  const lines = [];
  for (const h of households) {
    const id = Number(h.id);
    const e = activity.get(id);
    if (!e) continue;
    const spent = Object.fromEntries(KINDS.map((k) => [k, e.spends[k] ?? 0]));
    const made = Object.fromEntries(ENDPOINTS.map((k) => [k, e.calls[k] ?? 0]));
    lines.push({
      id,
      held: Number(h.held),
      granted: Number(h.granted),
      spent: Number(h.spent),
      spends: spent,
      calls: made,
      check: needsCheck({
        pdfReads: made["parse-pdf"],
        geocodes: made.geocode,
        paidProcessings: spent.first + spent.reprocess,
      }),
    });
  }
  return lines;
}

// calls: { household_id?, day, endpoint, n }; spends: { household_id?, day, kind, n }.
// Returns Map<householdId, Map<day, { calls, spends }>>, rows without a
// household id under 0 (the single-household query).
export function byDay(calls, spends) {
  const out = new Map();
  const cell = (id, day) => {
    if (!out.has(id)) out.set(id, new Map());
    const days = out.get(id);
    if (!days.has(day)) days.set(day, { calls: {}, spends: {} });
    return days.get(day);
  };
  for (const r of calls) cell(Number(r.household_id ?? 0), String(r.day)).calls[String(r.endpoint)] = Number(r.n);
  for (const r of spends) cell(Number(r.household_id ?? 0), String(r.day)).spends[String(r.kind)] = Number(r.n);
  return out;
}

// Every day from `first` to `last` (YYYY-MM-DD, UTC), inclusive.
export function dayRange(first, last) {
  const days = [];
  for (let t = Date.parse(`${first}T00:00:00Z`); t <= Date.parse(`${last}T00:00:00Z`); t += 86_400_000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

// The calls the "check" rule weighs (PDF reads and geocodes) against the
// credits spent, per day, as grouped bars. Inline SVG, no library.
export function dailyChart(days, cells) {
  const width = 640;
  const height = 160;
  const pad = { top: 12, right: 8, bottom: 22, left: 28 };
  const series = days.map((d) => {
    const c = cells.get(d);
    return {
      day: d,
      calls: c ? (c.calls["parse-pdf"] ?? 0) + (c.calls.geocode ?? 0) : 0,
      spends: c ? sum(c.spends) : 0,
    };
  });
  const max = Math.max(1, ...series.map((s) => Math.max(s.calls, s.spends)));
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const slot = plotW / Math.max(1, series.length);
  const bar = Math.max(1, Math.min(10, slot / 2 - 1));
  const y = (v) => pad.top + plotH - (v / max) * plotH;
  const bars = series
    .map((s, i) => {
      const x = pad.left + i * slot + slot / 2;
      const title = `${s.day}: ${s.calls} PDF reads and geocodes, ${s.spends} credits spent`;
      return (
        `<g><title>${escapeHtml(title)}</title>` +
        `<rect class="calls" x="${(x - bar).toFixed(1)}" y="${y(s.calls).toFixed(1)}" width="${bar.toFixed(1)}" height="${(pad.top + plotH - y(s.calls)).toFixed(1)}"/>` +
        `<rect class="spends" x="${x.toFixed(1)}" y="${y(s.spends).toFixed(1)}" width="${bar.toFixed(1)}" height="${(pad.top + plotH - y(s.spends)).toFixed(1)}"/></g>`
      );
    })
    .join("");
  const label = (i) =>
    `<text x="${(pad.left + i * slot + slot / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle">${series[i].day.slice(5)}</text>`;
  const labels = series.length ? [label(0), series.length > 1 ? label(series.length - 1) : ""].join("") : "";
  return (
    `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily PDF reads and geocodes against credits spent">` +
    `<line class="axis" x1="${pad.left}" y1="${pad.top + plotH}" x2="${width - pad.right}" y2="${pad.top + plotH}"/>` +
    `<text x="${pad.left - 4}" y="${pad.top + 4}" text-anchor="end">${max}</text>` +
    `<text x="${pad.left - 4}" y="${pad.top + plotH}" text-anchor="end">0</text>` +
    bars +
    labels +
    `</svg>`
  );
}

function summaryTable(lines) {
  if (lines.length === 0) return `<p class="empty">No household made a call or spent a credit in this window.</p>`;
  const head =
    `<tr><th>Household</th><th>Held</th><th>Credits granted</th><th>Credits spent (all time)</th>` +
    KINDS.map((k) => `<th>Spent: ${k}</th>`).join("") +
    ENDPOINTS.map((k) => `<th>Calls: ${k}</th>`).join("") +
    `<th>Check</th></tr>`;
  const rows = lines
    .map(
      (l) =>
        `<tr${l.check ? ` class="check"` : ""}><td>${l.id}</td><td>${l.held}</td><td>${l.granted}</td><td>${l.spent}</td>` +
        KINDS.map((k) => `<td>${l.spends[k]}</td>`).join("") +
        ENDPOINTS.map((k) => `<td>${l.calls[k]}</td>`).join("") +
        `<td>${l.check ? "check" : ""}</td></tr>`
    )
    .join("");
  return `<div class="scroll"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}

// One self-contained page: no script, no outside request.
// report: { target, days, chartDays, generatedAt (ISO), lines, daily, firstDay, lastDay }
export function renderHtml(report) {
  const chartRange = dayRange(report.firstDay, report.lastDay);
  const sections = report.lines
    .map((l) => {
      const cells = report.daily.get(l.id) ?? new Map();
      return (
        `<section><h2>Household ${l.id}${l.check ? ` <span class="badge">check</span>` : ""}</h2>` +
        `<p class="meta">${l.held} held, ${l.spent} of ${l.granted} credits spent</p>` +
        dailyChart(chartRange, cells) +
        `</section>`
      );
    })
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Flatpare usage</title>
<style>
:root { --bg: #ffffff; --fg: #111111; --muted: #555555; --line: #d4d4d4; --calls: #2346ff; --spends: #b45309; --check: #fdecee; --check-fg: #c8102e; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #111111; --fg: #f2f2f2; --muted: #b0b0b0; --line: #3a3a3a; --calls: #8fa2ff; --spends: #ffa94d; --check: #3a1418; --check-fg: #ff5c6c; }
}
* { box-sizing: border-box; }
body { margin: 0; padding: 24px 16px; background: var(--bg); color: var(--fg); font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1100px; margin: 0 auto; }
h1 { font-size: 22px; margin: 0 0 4px; }
h2 { font-size: 16px; margin: 0 0 2px; }
.meta, .empty, .note { color: var(--muted); margin: 0 0 12px; }
.scroll { overflow-x: auto; margin: 16px 0 24px; }
table { border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { border: 1px solid var(--line); padding: 4px 8px; text-align: right; white-space: nowrap; }
th { font-weight: 600; }
tr.check td { background: var(--check); color: var(--check-fg); font-weight: 600; }
section { border-top: 1px solid var(--line); padding: 16px 0; }
.badge { color: var(--check-fg); font-size: 13px; }
.chart { width: 100%; max-width: 640px; height: auto; display: block; }
.chart text { fill: var(--muted); font-size: 10px; }
.chart .axis { stroke: var(--line); }
.chart .calls { fill: var(--calls); }
.chart .spends { fill: var(--spends); }
.legend span { display: inline-block; width: 10px; height: 10px; margin: 0 4px 0 12px; vertical-align: middle; }
</style>
</head>
<body>
<main>
<h1>Flatpare usage</h1>
<p class="meta">Database: ${escapeHtml(report.target)}. Last ${report.days} day(s), made ${escapeHtml(report.generatedAt)}.</p>
<p class="note">A household is marked "check" when PDF reads exceed twice the credits spent on first processings and reprocesses plus 5, or geocodes exceed three times those credits plus 20. A mark is a reason to look, not a verdict.</p>
${summaryTable(report.lines)}
${sections ? `<p class="legend">Daily, last ${report.chartDays} days:<span style="background:var(--calls)"></span>PDF reads and geocodes<span style="background:var(--spends)"></span>credits spent</p>${sections}` : ""}
</main>
</body>
</html>
`;
}

// The email: the summary table inline (email clients drop SVG), the page
// attached. Inline styles only, since most clients strip <style>.
export function renderEmail(report) {
  const flagged = report.lines.filter((l) => l.check).length;
  const subject =
    `Flatpare usage, last ${report.days} day(s): ${report.lines.length} active` +
    (flagged ? `, ${flagged} to check` : "");
  const cell = "border:1px solid #d4d4d4;padding:4px 8px;text-align:right;white-space:nowrap";
  const rows = report.lines
    .map((l) => {
      const style = l.check ? `${cell};background:#fdecee;color:#c8102e;font-weight:600` : cell;
      const cells = [
        l.id,
        l.held,
        `${l.spent}/${l.granted}`,
        KINDS.map((k) => l.spends[k]).join("/"),
        ENDPOINTS.map((k) => l.calls[k]).join("/"),
        l.check ? "check" : "",
      ];
      return `<tr>${cells.map((c) => `<td style="${style}">${escapeHtml(c)}</td>`).join("")}</tr>`;
    })
    .join("");
  const heads = [
    "Household",
    "Held",
    "Credits spent/granted",
    "Spent first/reprocess/recompute",
    "Calls parse-pdf/geocode/distance/check-listing",
    "Check",
  ];
  const table = report.lines.length
    ? `<table style="border-collapse:collapse;font-size:13px"><tr>${heads.map((h) => `<th style="${cell}">${h}</th>`).join("")}</tr>${rows}</table>`
    : `<p>No household made a call or spent a credit in this window.</p>`;
  const html =
    `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;color:#111">` +
    `<p>Database: ${escapeHtml(report.target)}. Last ${report.days} day(s), made ${escapeHtml(report.generatedAt)}.</p>` +
    table +
    `<p style="color:#555">The attached page has a daily chart per household.</p></div>`;
  const text = [
    `Database: ${report.target}. Last ${report.days} day(s), made ${report.generatedAt}.`,
    ...report.lines.map(
      (l) =>
        `household ${l.id}: held ${l.held}, credits ${l.spent}/${l.granted}, ` +
        `spent ${KINDS.map((k) => l.spends[k]).join("/")}, calls ${ENDPOINTS.map((k) => l.calls[k]).join("/")}` +
        (l.check ? " CHECK" : "")
    ),
    report.lines.length ? "" : "No household made a call or spent a credit in this window.",
  ]
    .filter(Boolean)
    .join("\n");
  return { subject, html, text };
}

export const CADENCES = { daily: 1, weekly: 7, monthly: 30 };

// Whether a scheduled run on `date` sends: every day, Mondays, or the 1st (UTC).
export function cadenceDue(cadence, date) {
  if (cadence === "daily") return true;
  if (cadence === "weekly") return date.getUTCDay() === 1;
  if (cadence === "monthly") return date.getUTCDate() === 1;
  return false;
}
