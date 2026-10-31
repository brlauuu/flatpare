#!/usr/bin/env node
// Per-household usage, for spotting a client that processes without paying
// (#413). Read-only. The server charges by the apartment id a request names
// and cannot see an address or a PDF, so a modified client can geocode or
// read PDFs without spending a credit (docs/security-notes.md, "The client
// names the charge"). This puts side by side what each household paid for
// (credit_spends) and the calls it made (process_usage), so one making far
// more calls than it paid for stands out. It caps nothing.
//
// Targets the same database as the app and scripts/beta-pass.mjs: Turso when
// TURSO_DATABASE_URL is set (`.env.local` is loaded, and a shell value wins),
// the local SQLite file otherwise. The target is printed first.
//
//   node scripts/usage-report.mjs [--days 30]
//   node scripts/usage-report.mjs --household <id> [--days 30]
//   node scripts/usage-report.mjs [--days 30] [--html <file>] [--email <address>]
//   node scripts/usage-report.mjs --cadence daily|weekly|monthly --email <address> [--force]
//
// The first form prints one line per household with any activity in the
// window; the second prints that household's calls and spends day by day.
// The third writes the same summary as a page with a daily chart per
// household (#431), and/or emails it (summary inline, page attached, through
// Resend). It then prints nothing but the target and the outcome, because
// the scheduled run's log is public (.github/workflows/usage-report.yml).
// `--cadence` sets the window (1, 7 or 30 days) and sends only on a day that
// matches it (every day, Mondays, the 1st, UTC); `--force` sends anyway.
// Both counts start with the release that added them (0.27.0): there is no
// history before it.
//
// A line is marked "check" when PDF reads exceed twice the credits spent on
// first processings and reprocesses plus 5, or geocodes exceed three times
// those credits plus 20 (`needsCheck` in usage-report-lib.mjs, the one rule
// every output uses).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@libsql/client";
import {
  CADENCES,
  CHART_MIN_DAYS,
  ENDPOINTS,
  KINDS,
  byDay,
  cadenceDue,
  renderEmail,
  renderHtml,
  summarize,
} from "./usage-report-lib.mjs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

function usage(code = 1) {
  console.error(
    "usage:\n" +
      "  node scripts/usage-report.mjs [--days N]\n" +
      "  node scripts/usage-report.mjs --household ID [--days N]\n" +
      "  node scripts/usage-report.mjs [--days N] [--html FILE] [--email ADDRESS]\n" +
      "  node scripts/usage-report.mjs --cadence daily|weekly|monthly --email ADDRESS [--force]"
  );
  process.exit(code);
}

const BOOLEAN_FLAGS = new Set(["force"]);

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) usage();
    const name = arg.slice(2);
    if (BOOLEAN_FLAGS.has(name)) {
      flags[name] = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) usage();
    flags[name] = value;
    i += 1;
  }
  return flags;
}

function positiveInt(name, raw, fallback) {
  if (raw === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(raw)) {
    console.error(`--${name} must be a positive integer, got "${raw}"`);
    process.exit(1);
  }
  return Number(raw);
}

function client() {
  return createClient(
    process.env.TURSO_DATABASE_URL
      ? { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
      : { url: process.env.LOCAL_DB_URL ?? "file:./data/flatpare.db" }
  );
}

function pad(value, width) {
  return String(value).padStart(width);
}

async function summaryLines(db, since) {
  const households = await db.execute({
    sql: `SELECT h.id, h.apartment_credits_granted AS granted, h.apartments_ever_added AS spent,
                 (SELECT COUNT(*) FROM apartments a WHERE a.household_id = h.id) AS held
            FROM households h ORDER BY h.id`,
    args: [],
  });
  const calls = await db.execute({
    sql: `SELECT household_id, endpoint, SUM(count) AS n FROM process_usage
           WHERE window_start >= ? GROUP BY household_id, endpoint`,
    args: [since],
  });
  const spends = await db.execute({
    sql: `SELECT household_id, kind, COUNT(*) AS n FROM credit_spends
           WHERE spent_at >= ? GROUP BY household_id, kind`,
    args: [since],
  });
  return summarize(households.rows, calls.rows, spends.rows);
}

function printSummary(lines) {
  console.log(
    "household  held  credits(granted/spent)  window spends first/reprocess/recompute" +
      "  calls parse-pdf/geocode/distance/check-listing"
  );
  for (const l of lines) {
    const s = KINDS.map((k) => l.spends[k]).join("/");
    const c = ENDPOINTS.map((k) => l.calls[k]).join("/");
    console.log(
      `${pad(l.id, 9)}  ${pad(l.held, 4)}  ${pad(`${l.granted}/${l.spent}`, 22)}` +
        `  ${pad(s, 39)}  ${pad(c, 46)}${l.check ? "  check" : ""}`
    );
  }
  if (lines.length === 0) console.log("(no household made a call or spent a credit in this window)");
}

// Day by day; every household, or one when `householdId` is given.
async function dailyCells(db, since, householdId = null) {
  const scope = householdId === null ? "" : "AND household_id = ?";
  const args = householdId === null ? [since] : [since, householdId];
  const calls = await db.execute({
    sql: `SELECT household_id, date(window_start, 'unixepoch') AS day, endpoint, SUM(count) AS n
            FROM process_usage WHERE window_start >= ? ${scope} GROUP BY household_id, day, endpoint`,
    args,
  });
  const spends = await db.execute({
    sql: `SELECT household_id, date(spent_at, 'unixepoch') AS day, kind, COUNT(*) AS n
            FROM credit_spends WHERE spent_at >= ? ${scope} GROUP BY household_id, day, kind`,
    args,
  });
  return byDay(calls.rows, spends.rows);
}

async function printDetail(db, householdId, since) {
  const days = (await dailyCells(db, since, householdId)).get(householdId) ?? new Map();
  console.log("day         spends first/reprocess/recompute  calls parse-pdf/geocode/distance/check-listing");
  for (const d of [...days.keys()].sort()) {
    const e = days.get(d);
    const s = KINDS.map((k) => e.spends[k] ?? 0).join("/");
    const c = ENDPOINTS.map((k) => e.calls[k] ?? 0).join("/");
    console.log(`${d}  ${pad(s, 32)}  ${pad(c, 46)}`);
  }
  if (days.size === 0) console.log("(nothing in this window)");
}

function emailFrom() {
  const explicit = process.env.EMAIL_FROM?.trim();
  if (explicit) return explicit;
  const domain = process.env.RESEND_EMAIL_DOMAIN?.trim();
  return domain ? `Flatpare <hello@${domain}>` : null;
}

// Returns null on success, or a short reason. Never prints the key, the
// recipient or the provider's message, which can quote the request back.
// The same plain call as scripts/beta-pass.mjs and src/lib/email.ts.
async function sendReport(to, email, page, day) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = emailFrom();
  if (!key) return "RESEND_API_KEY is not set";
  if (!from) return "neither EMAIL_FROM nor RESEND_EMAIL_DOMAIN is set";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: email.subject,
        text: email.text,
        html: email.html,
        attachments: [{ filename: `flatpare-usage-${day}.html`, content: Buffer.from(page).toString("base64") }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? null : `Resend answered ${res.status}`;
  } catch (err) {
    return err instanceof Error ? err.name : "request failed";
  }
}

// The flags, checked: which form runs and over how many days.
function readOptions(flags) {
  const cadence = flags.cadence;
  if (cadence !== undefined && !(cadence in CADENCES)) {
    console.error(`--cadence must be daily, weekly or monthly, got "${cadence}"`);
    process.exit(1);
  }
  if (cadence !== undefined && flags.days !== undefined) usage();
  const householdId = positiveInt("household", flags.household, null);
  const quiet = flags.html !== undefined || flags.email !== undefined;
  if (householdId !== null && (quiet || cadence)) usage();
  if (cadence && flags.email === undefined) usage();
  return {
    cadence,
    days: cadence ? CADENCES[cadence] : positiveInt("days", flags.days, 30),
    householdId,
    quiet,
    html: flags.html,
    email: flags.email,
    force: flags.force === true,
  };
}

// The page and/or the email. Prints only the outcome: see the top of the file.
async function writeOutputs(opts, report) {
  const page = renderHtml(report);
  if (opts.html !== undefined) {
    mkdirSync(dirname(opts.html), { recursive: true });
    writeFileSync(opts.html, page);
    console.log(`[usage-report] page written to ${opts.html}`);
  }
  if (opts.email === undefined) return;
  const failed = await sendReport(opts.email, renderEmail(report), page, report.lastDay);
  if (failed) {
    console.error(`[usage-report] email not sent: ${failed}`);
    process.exit(1);
  }
  console.log("[usage-report] email sent");
}

async function run(db, opts, target, now) {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const since = nowSeconds - opts.days * 86400;
  if (opts.householdId !== null) return printDetail(db, opts.householdId, since);
  const lines = await summaryLines(db, since);
  if (!opts.quiet) return printSummary(lines);

  const chartDays = Math.max(opts.days, CHART_MIN_DAYS);
  const chartSince = nowSeconds - chartDays * 86400;
  await writeOutputs(opts, {
    target,
    days: opts.days,
    chartDays,
    generatedAt: now.toISOString().replace(/\.\d+Z$/, "Z"),
    lines,
    daily: await dailyCells(db, chartSince),
    firstDay: new Date(chartSince * 1000).toISOString().slice(0, 10),
    lastDay: now.toISOString().slice(0, 10),
  });
}

async function main() {
  const opts = readOptions(parseFlags(process.argv.slice(2)));
  const now = new Date();
  const target = process.env.TURSO_DATABASE_URL
    ? `Turso (${new URL(process.env.TURSO_DATABASE_URL).host})`
    : `local file (${process.env.LOCAL_DB_URL ?? "file:./data/flatpare.db"})`;
  console.log(`[usage-report] database: ${target}, last ${opts.days} day(s)`);
  if (opts.cadence && !opts.force && !cadenceDue(opts.cadence, now)) {
    console.log(`[usage-report] ${opts.cadence} report not due today, nothing sent`);
    return;
  }
  try {
    await run(client(), opts, target, now);
  } catch (err) {
    if (/no such table: credit_spends/.test(String(err?.message))) {
      console.error(
        `[usage-report] ${target} has no credit_spends table: migration 0027 has not run there yet. ` +
          "It runs at app boot or on a Vercel build of this release."
      );
      process.exit(1);
    }
    // The scheduled log is public: name the failure, not its message.
    if (opts.quiet) {
      console.error(`[usage-report] failed: ${err?.code || err?.name || "error"}`);
      process.exit(1);
    }
    throw err;
  }
}

await main();
