#!/usr/bin/env node
// Mint, list and revoke beta passes (#239, #240) against whichever database
// the environment points at — Turso when TURSO_DATABASE_URL is set, the
// local SQLite file otherwise. `.env.local` is loaded automatically, the way
// `next dev` loads it, so a plain `node scripts/beta-pass.mjs` targets the
// same database the app would; a variable already set in the shell wins, so
// `TURSO_DATABASE_URL= node scripts/beta-pass.mjs ...` forces the local file
// (an explicitly empty value is what src/lib/db/target.ts honours too).
//
// The target is printed before anything runs, because the same command hits
// production with .env.local present and a scratch file without it.
//
//   node scripts/beta-pass.mjs create [--label "Ana"] [--max-uses 1] [--credits 40] [--expires-in-days 14]
//   node scripts/beta-pass.mjs list
//   node scripts/beta-pass.mjs revoke <code>
//
// `create` prints the link to share. The site URL comes from
// NEXT_PUBLIC_SITE_URL, then VERCEL_PROJECT_PRODUCTION_URL, then localhost —
// the same precedence as src/lib/site.ts.
//
// A revoked pass stops admitting NEW sign-ups. It never touches anyone
// already in, and it never claws back anything granted (decided on #240).
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createClient } from "@libsql/client";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

function usage(code = 1) {
  console.error(
    "usage:\n" +
      "  node scripts/beta-pass.mjs create [--label L] [--max-uses N] [--credits N] [--expires-in-days N]\n" +
      "  node scripts/beta-pass.mjs list\n" +
      "  node scripts/beta-pass.mjs revoke <code>"
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

function positiveInt(name, raw) {
  if (raw === undefined) return null;
  if (!/^[1-9]\d*$/.test(raw)) {
    console.error(`--${name} must be a positive integer, got "${raw}"`);
    process.exit(1);
  }
  return Number(raw);
}

function siteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;
  return "http://localhost:3002";
}

function client() {
  return createClient(
    process.env.TURSO_DATABASE_URL
      ? {
          url: process.env.TURSO_DATABASE_URL,
          authToken: process.env.TURSO_AUTH_TOKEN,
        }
      : { url: process.env.LOCAL_DB_URL ?? "file:./data/flatpare.db" }
  );
}

const [command, ...rest] = process.argv.slice(2);
const db = client();
const target = process.env.TURSO_DATABASE_URL
  ? `Turso (${new URL(process.env.TURSO_DATABASE_URL).host})`
  : `local file (${process.env.LOCAL_DB_URL ?? "file:./data/flatpare.db"})`;
console.log(`[beta-pass] database: ${target}`);

try {
  if (command === "create") {
    const flags = parseFlags(rest);
    const code = randomUUID().replace(/-/g, "");
    const maxUses = positiveInt("max-uses", flags["max-uses"]);
    const credits = positiveInt("credits", flags.credits) ?? 40;
    const days = positiveInt("expires-in-days", flags["expires-in-days"]);
    const expiresAt =
      days === null ? null : Math.floor(Date.now() / 1000) + days * 86400;
    await db.execute({
      sql: "INSERT INTO beta_passes (code, label, credits, max_uses, expires_at) VALUES (?, ?, ?, ?, ?)",
      args: [code, flags.label ?? null, credits, maxUses, expiresAt],
    });
    console.log(`[beta-pass] created on ${target}`);
    console.log(`  label:    ${flags.label ?? "(none)"}`);
    console.log(`  credits:  ${credits}`);
    console.log(`  max uses: ${maxUses ?? "unlimited"}`);
    console.log(
      `  expires:  ${expiresAt === null ? "never" : new Date(expiresAt * 1000).toISOString()}`
    );
    console.log(`  link:     ${siteUrl()}/beta/${code}`);
    console.log(
      "  say:      Beta accounts are free; your data and credits are yours to keep and are not taken back when the beta ends."
    );
  } else if (command === "list") {
    if (rest.length > 0) usage();
    const res = await db.execute(
      "SELECT p.code, p.label, p.credits, p.max_uses, p.uses, p.expires_at, p.revoked_at, " +
        "(SELECT COUNT(*) FROM beta_pass_redemptions r WHERE r.pass_id = p.id) AS redeemed " +
        "FROM beta_passes p ORDER BY p.id"
    );
    console.log(`[beta-pass] ${res.rows.length} pass(es) on ${target}`);
    for (const r of res.rows) {
      const state = r.revoked_at
        ? "revoked"
        : r.expires_at && Number(r.expires_at) * 1000 <= Date.now()
          ? "expired"
          : r.max_uses !== null && Number(r.uses) >= Number(r.max_uses)
            ? "used up"
            : "live";
      console.log(
        `  ${r.code}  ${state.padEnd(8)}  uses ${r.uses}/${r.max_uses ?? "∞"}  redeemed ${r.redeemed}  credits ${r.credits}  ${r.label ?? ""}`
      );
    }
  } else if (command === "revoke") {
    const [code, ...extra] = rest;
    if (!code || extra.length > 0) usage();
    const res = await db.execute({
      sql: "UPDATE beta_passes SET revoked_at = unixepoch() WHERE code = ? AND revoked_at IS NULL",
      args: [code],
    });
    if (res.rowsAffected === 0) {
      console.error(`[beta-pass] no live pass with that code on ${target}`);
      process.exit(1);
    }
    console.log(`[beta-pass] revoked on ${target}; existing redemptions are untouched`);
  } else {
    usage(command === undefined || command === "--help" ? 0 : 1);
  }
} catch (err) {
  if (/no such table: beta_pass/.test(String(err?.message))) {
    console.error(
      `[beta-pass] ${target} has no beta_passes table: migration 0019 has not ` +
        "been applied to it. Migrations run when the app boots (src/instrumentation.ts) " +
        "or at a Vercel build — deploy, or run `npm run dev` against this database " +
        "once, and try again."
    );
    process.exit(1);
  }
  throw err;
} finally {
  db.close();
}
