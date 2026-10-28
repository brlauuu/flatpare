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
//
// The first form prints one line per household with any activity in the
// window; the second prints that household's calls and spends day by day.
// Both counts start with the release that added them (0.27.0): there is no
// history before it.
//
// A line is marked "check" when PDF reads exceed twice the credits spent on
// first processings and reprocesses plus 5, or geocodes exceed three times
// those credits plus 20. An honest household reads each PDF once per credit
// and geocodes a few times more (locations, retries, map upkeep), so these
// are loose on purpose: a mark is a reason to look, not a verdict.
import { existsSync } from "node:fs";
import { createClient } from "@libsql/client";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

function usage(code = 1) {
  console.error(
    "usage:\n" +
      "  node scripts/usage-report.mjs [--days N]\n" +
      "  node scripts/usage-report.mjs --household ID [--days N]"
  );
  process.exit(code);
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) usage();
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) usage();
    flags[arg.slice(2)] = value;
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

const ENDPOINTS = ["parse-pdf", "geocode", "distance", "check-listing"];
const KINDS = ["first", "reprocess", "recompute"];

function needsCheck({ pdfReads, geocodes, paidProcessings }) {
  return pdfReads > 2 * paidProcessings + 5 || geocodes > 3 * paidProcessings + 20;
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

async function summary(db, since) {
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

  const byHousehold = new Map();
  const entry = (id) => {
    if (!byHousehold.has(id)) byHousehold.set(id, { calls: {}, spends: {} });
    return byHousehold.get(id);
  };
  for (const r of calls.rows) entry(Number(r.household_id)).calls[String(r.endpoint)] = Number(r.n);
  for (const r of spends.rows) entry(Number(r.household_id)).spends[String(r.kind)] = Number(r.n);

  console.log(
    "household  held  credits(granted/spent)  window spends first/reprocess/recompute" +
      "  calls parse-pdf/geocode/distance/check-listing"
  );
  let shown = 0;
  for (const h of households.rows) {
    const id = Number(h.id);
    const e = byHousehold.get(id);
    if (!e) continue;
    shown += 1;
    const s = KINDS.map((k) => e.spends[k] ?? 0);
    const c = ENDPOINTS.map((k) => e.calls[k] ?? 0);
    const mark = needsCheck({ pdfReads: c[0], geocodes: c[1], paidProcessings: s[0] + s[1] }) ? "  check" : "";
    console.log(
      `${pad(id, 9)}  ${pad(Number(h.held), 4)}  ${pad(`${Number(h.granted)}/${Number(h.spent)}`, 22)}` +
        `  ${pad(s.join("/"), 39)}  ${pad(c.join("/"), 46)}${mark}`
    );
  }
  if (shown === 0) console.log("(no household made a call or spent a credit in this window)");
}

async function detail(db, householdId, since) {
  const calls = await db.execute({
    sql: `SELECT date(window_start, 'unixepoch') AS day, endpoint, SUM(count) AS n FROM process_usage
           WHERE household_id = ? AND window_start >= ? GROUP BY day, endpoint ORDER BY day`,
    args: [householdId, since],
  });
  const spends = await db.execute({
    sql: `SELECT date(spent_at, 'unixepoch') AS day, kind, COUNT(*) AS n FROM credit_spends
           WHERE household_id = ? AND spent_at >= ? GROUP BY day, kind ORDER BY day`,
    args: [householdId, since],
  });
  const days = new Map();
  const day = (d) => {
    if (!days.has(d)) days.set(d, { calls: {}, spends: {} });
    return days.get(d);
  };
  for (const r of calls.rows) day(String(r.day)).calls[String(r.endpoint)] = Number(r.n);
  for (const r of spends.rows) day(String(r.day)).spends[String(r.kind)] = Number(r.n);

  console.log("day         spends first/reprocess/recompute  calls parse-pdf/geocode/distance/check-listing");
  for (const d of [...days.keys()].sort()) {
    const e = days.get(d);
    const s = KINDS.map((k) => e.spends[k] ?? 0).join("/");
    const c = ENDPOINTS.map((k) => e.calls[k] ?? 0).join("/");
    console.log(`${d}  ${pad(s, 32)}  ${pad(c, 46)}`);
  }
  if (days.size === 0) console.log("(nothing in this window)");
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const days = positiveInt("days", flags.days, 30);
  const householdId = positiveInt("household", flags.household, null);
  const since = Math.floor(Date.now() / 1000) - days * 86400;

  const db = client();
  const target = process.env.TURSO_DATABASE_URL
    ? `Turso (${new URL(process.env.TURSO_DATABASE_URL).host})`
    : `local file (${process.env.LOCAL_DB_URL ?? "file:./data/flatpare.db"})`;
  console.log(`[usage-report] database: ${target}, last ${days} day(s)`);
  try {
    if (householdId === null) await summary(db, since);
    else await detail(db, householdId, since);
  } catch (err) {
    if (/no such table: credit_spends/.test(String(err?.message))) {
      console.error(
        `[usage-report] ${target} has no credit_spends table: migration 0027 has not run there yet. ` +
          "It runs at app boot or on a Vercel build of this release."
      );
      process.exit(1);
    }
    throw err;
  }
}

await main();
