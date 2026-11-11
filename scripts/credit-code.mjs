#!/usr/bin/env node
// Credit codes (#492): mint, list and revoke the codes that add credits to a
// household that redeems them on its Household page. While credits are
// counted without Stripe (FLATPARE_CREDITS=on), this is how a beta tester
// who ran out gets more.
//
//   node scripts/credit-code.mjs create [--credits 40] [--label "Ana"] [--max-uses 1] [--expires-in-days 30]
//   node scripts/credit-code.mjs list
//   node scripts/credit-code.mjs revoke <code>
//
// A code can be redeemed once per household, up to --max-uses households
// (unlimited when unset). Revoking stops the code; credits it already added
// are kept.
//
// Like scripts/beta-pass.mjs, it loads .env.local itself (a shell value
// wins), so it touches whatever TURSO_DATABASE_URL names there. It prints the
// database before touching it. `TURSO_DATABASE_URL= node scripts/credit-code.mjs ...`
// forces the local file. The tables exist once migration 0029 has run there
// (at app boot or a Vercel build).

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createClient } from "@libsql/client";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

function usage(code = 1) {
  console.error(
    "usage:\n" +
      "  node scripts/credit-code.mjs create [--credits N] [--label L] [--max-uses N] [--expires-in-days N]\n" +
      "  node scripts/credit-code.mjs list\n" +
      "  node scripts/credit-code.mjs revoke <code>"
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

function client() {
  return createClient(
    process.env.TURSO_DATABASE_URL
      ? { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
      : { url: process.env.LOCAL_DB_URL ?? "file:./data/flatpare.db" }
  );
}

const [command, ...rest] = process.argv.slice(2);
if (command === undefined || command === "--help") usage(0);
const db = client();
const target = process.env.TURSO_DATABASE_URL
  ? `Turso (${new URL(process.env.TURSO_DATABASE_URL).host})`
  : `local file (${process.env.LOCAL_DB_URL ?? "file:./data/flatpare.db"})`;
console.log(`[credit-code] database: ${target}`);

try {
  if (command === "create") {
    const flags = parseFlags(rest);
    const code = randomUUID().replace(/-/g, "");
    const credits = positiveInt("credits", flags.credits) ?? 40;
    const maxUses = positiveInt("max-uses", flags["max-uses"]);
    const days = positiveInt("expires-in-days", flags["expires-in-days"]);
    const expiresAt = days === null ? null : Math.floor(Date.now() / 1000) + days * 86400;
    await db.execute({
      sql: "INSERT INTO credit_codes (code, label, credits, max_uses, expires_at) VALUES (?, ?, ?, ?, ?)",
      args: [code, flags.label ?? null, credits, maxUses, expiresAt],
    });
    console.log(`[credit-code] created on ${target}`);
    console.log(`  label:    ${flags.label ?? "(none)"}`);
    console.log(`  credits:  ${credits}`);
    console.log(`  max uses: ${maxUses ?? "unlimited"} (once per household)`);
    console.log(`  expires:  ${expiresAt === null ? "never" : new Date(expiresAt * 1000).toISOString()}`);
    console.log(`  code:     ${code}`);
    console.log("  say:      Enter this code under Credit code on the Household page.");
  } else if (command === "list") {
    if (rest.length > 0) usage();
    const res = await db.execute(
      "SELECT code, label, credits, max_uses, uses, expires_at, revoked_at FROM credit_codes ORDER BY id"
    );
    console.log(`[credit-code] ${res.rows.length} code(s) on ${target}`);
    for (const r of res.rows) {
      const state = r.revoked_at
        ? "revoked"
        : r.expires_at && Number(r.expires_at) * 1000 <= Date.now()
          ? "expired"
          : r.max_uses !== null && Number(r.uses) >= Number(r.max_uses)
            ? "used up"
            : "live";
      console.log(
        `  ${r.code}  ${state.padEnd(8)}  uses ${r.uses}/${r.max_uses ?? "∞"}  credits ${r.credits}  ${r.label ?? ""}`
      );
    }
  } else if (command === "revoke") {
    const [code, ...extra] = rest;
    if (!code || extra.length > 0) usage();
    const res = await db.execute({
      sql: "UPDATE credit_codes SET revoked_at = unixepoch() WHERE code = ? AND revoked_at IS NULL",
      args: [code.replace(/[\s-]/g, "").toLowerCase()],
    });
    if (res.rowsAffected === 0) {
      console.error(`[credit-code] no live code like that on ${target}`);
      process.exit(1);
    }
    console.log(`[credit-code] revoked on ${target}; credits already added are kept`);
  } else {
    usage();
  }
} catch (err) {
  if (/no such table: credit_codes/.test(String(err?.message))) {
    console.error(
      `[credit-code] ${target} has no credit_codes table: migration 0029 has not been ` +
        "applied to it yet. It runs when the app boots or at a Vercel build."
    );
    process.exit(1);
  }
  throw err;
} finally {
  db.close();
}
