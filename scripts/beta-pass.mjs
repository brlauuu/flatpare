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
//   node scripts/beta-pass.mjs create [--label "Ana"] [--max-uses 1] [--credits 40] [--expires-in-days 14] [--email ana@example.com]
//   node scripts/beta-pass.mjs list
//   node scripts/beta-pass.mjs revoke <code>
//
// `create` prints the link to share. The site URL comes from
// NEXT_PUBLIC_SITE_URL, then VERCEL_PROJECT_PRODUCTION_URL, then localhost —
// the same precedence as src/lib/site.ts.
//
// `--email` sends the link to that address (#300), through the same Resend
// call as src/lib/email.ts: RESEND_API_KEY, and EMAIL_FROM or
// RESEND_EMAIL_DOMAIN for the sender. The pass is created FIRST and the link
// is always printed, so a failed send costs nothing: copy the link by hand.
// The address is used for that one message and is not stored.
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
      "  node scripts/beta-pass.mjs create [--label L] [--max-uses N] [--credits N] [--expires-in-days N] [--email ADDRESS]\n" +
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

const KEEP_SENTENCE =
  "Beta accounts are free; your data and credits are yours to keep and are not taken back when the beta ends.";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function emailFrom() {
  const explicit = process.env.EMAIL_FROM?.trim();
  if (explicit) return explicit;
  const domain = process.env.RESEND_EMAIL_DOMAIN?.trim();
  return domain ? `Flatpare <hello@${domain}>` : null;
}

// Returns null on success, or a short reason. Never prints the key.
async function sendBetaInvite(to, link, code, expiresAt) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = emailFrom();
  if (!key) return "RESEND_API_KEY is not set";
  if (!from) return "neither EMAIL_FROM nor RESEND_EMAIL_DOMAIN is set";

  const lines = [
    "You are invited to the Flatpare private beta: a shared place to compare apartments with the person you are moving in with.",
    "Open the link below, then sign in. The link opens the door for your account" +
      (expiresAt === null ? "." : ` and is valid until ${new Date(expiresAt * 1000).toISOString().slice(0, 10)}.`),
    KEEP_SENTENCE,
  ];
  const html =
    `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:16px;color:#111;max-width:520px;margin:0 auto;padding:24px">` +
    lines.map((l) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(l)}</p>`).join("") +
    `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#0f6b70;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block">Join the beta</a></p>` +
    `<p style="margin:0;font-size:13px;color:#666;line-height:1.5">If the button does not work, open ${escapeHtml(link)}</p>` +
    `</div>`;
  const replyTo = process.env.EMAIL_REPLY_TO?.trim();
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "idempotency-key": `beta-invite/${code}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "Your invitation to the Flatpare beta",
        text: [lines[0], lines[1], link, lines[2]].join("\n\n"),
        html,
        ...(replyTo ? { reply_to: [replyTo] } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return null;
    const body = await res.json().catch(() => null);
    return `Resend answered ${res.status}${body?.message ? `: ${body.message}` : ""}`;
  } catch (err) {
    return err instanceof Error ? err.name : "request failed";
  }
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
    const email = flags.email?.trim();
    // Checked before the insert, so a typo does not leave a pass behind.
    if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.error(`--email must be an email address, got "${flags.email}"`);
      process.exit(1);
    }
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
    console.log(`  say:      ${KEEP_SENTENCE}`);
    if (email !== undefined) {
      const problem = await sendBetaInvite(email, `${siteUrl()}/beta/${code}`, code, expiresAt);
      if (problem === null) {
        console.log(`  email:    sent to ${email} from ${emailFrom()}`);
      } else {
        console.error(`  email:    NOT sent (${problem}). The pass exists; share the link above by hand.`);
        process.exitCode = 1;
      }
    }
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
