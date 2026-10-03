#!/usr/bin/env node
// Captures the landing page's hero image (#301): the real comparison grid,
// light and dark, filled with believable but invented listings.
//
//   npm run build && node scripts/capture-hero.mjs
//
// What is real and what is not: the app, its components and its styles are
// the production build, signed in for real. Only the household's data is
// made up — Playwright answers GET /api/apartments, /api/ratings and
// /api/locations with the rows below, so nothing is written anywhere and no
// real person's listing or name appears. Re-run it whenever the grid
// changes, so the landing page keeps showing what users actually get.
//
// It starts its own server on a throwaway local SQLite file with encryption
// off and the shared-password sign-in, whatever .env.local says: the empty
// values below override it (every check in the app is on truthiness). It
// refuses to continue unless the server reports the local file.
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { createClient } from "@libsql/client";
import { chromium } from "playwright";
import sharp from "sharp";

const PORT = 3013;
const BASE = `http://localhost:${PORT}`;
const DB_FILE = "data/hero-capture.db";
const PASSWORD = "hero-capture";
const OUT_DIR = "public/hero";
// The hero frame shows the image at roughly 16:10.
const VIEWPORT = { width: 1280, height: 800 };

// ── The invented household ────────────────────────────────────────────────
// Zürich, two people (Lena and Jonas — fictional), five listings, two places
// that matter to them. Rents, sizes and commute times are in realistic
// ranges for the city; the ratings differ a little, as two people's would.
const LOCATIONS = [
  { id: "7d1c0b8e-0000-4000-8000-000000000001", label: "Work", icon: "Briefcase", address: "Hardturmstrasse 161, 8005 Zürich" },
  { id: "7d1c0b8e-0000-4000-8000-000000000002", label: "Climbing gym", icon: "Dumbbell", address: "Thurgauerstrasse 40, 8050 Zürich" },
];
const [WORK, GYM] = LOCATIONS.map((l) => l.id);

const APARTMENTS = [
  {
    name: "Bright 3.5-room flat with balcony near Idaplatz",
    address: "Zurlindenstrasse 212, 8003 Zürich",
    shortCode: "KTR-3B-1b-WY-8003",
    rentChf: 2650, sizeM2: 78, numRooms: 3.5, numBathrooms: 1, numBalconies: 1, hasWashingMachine: true,
    availableFrom: "2026-12-01",
    distances: { [WORK]: { bikeMin: 9, transitMin: 16 }, [GYM]: { bikeMin: 21, transitMin: 27 } },
    ratings: [[5, 4, 5, 4, 5], [4, 4, 5, 4, 4]],
  },
  {
    name: "Renovated 3-room flat in Wipkingen",
    address: "Nordstrasse 154, 8037 Zürich",
    shortCode: "PWM-3B-1b-WY-8037",
    rentChf: 2380, sizeM2: 68, numRooms: 3, numBathrooms: 1, numBalconies: 1, hasWashingMachine: true,
    availableFrom: "2026-11-15",
    distances: { [WORK]: { bikeMin: 7, transitMin: 12 }, [GYM]: { bikeMin: 14, transitMin: 19 } },
    ratings: [[4, 3, 4, 4, 4], [4, 3, 5, 3, 4]],
  },
  {
    name: "Spacious 4.5-room family flat in Oerlikon",
    address: "Schaffhauserstrasse 418, 8050 Zürich",
    shortCode: "GHD-4B-2b-WY-8050",
    rentChf: 3120, sizeM2: 104, numRooms: 4.5, numBathrooms: 2, numBalconies: 2, hasWashingMachine: true,
    availableFrom: "2027-01-01",
    distances: { [WORK]: { bikeMin: 19, transitMin: 22 }, [GYM]: { bikeMin: 5, transitMin: 8 } },
    ratings: [[5, 5, 3, 5, 4], [4, 5, 3, 5, 3]],
  },
  {
    name: "Charming attic flat in the old town",
    address: "Spiegelgasse 9, 8001 Zürich",
    shortCode: "NVB-2B-1b-WN-8001",
    rentChf: 2240, sizeM2: 55, numRooms: 2.5, numBathrooms: 1, numBalconies: 0, hasWashingMachine: false,
    availableFrom: "2026-11-01",
    distances: { [WORK]: { bikeMin: 13, transitMin: 18 }, [GYM]: { bikeMin: 18, transitMin: 24 } },
    ratings: [[3, 1, 5, 3, 4], [2, 1, 5, 2, 3]],
  },
  {
    name: "Modern 3.5-room flat by the Limmat, Altstetten",
    address: "Bändlistrasse 54, 8064 Zürich",
    shortCode: "RFX-3B-1b-WY-8064",
    rentChf: 2490, sizeM2: 82, numRooms: 3.5, numBathrooms: 1, numBalconies: 1, hasWashingMachine: true,
    availableFrom: "2026-12-15",
    distances: { [WORK]: { bikeMin: 11, transitMin: 14 }, [GYM]: { bikeMin: 24, transitMin: 31 } },
    ratings: [[4, 4, 3, 5, 4], [5, 4, 3, 4, 4]],
  },
];

const PEOPLE = [
  { userId: "hero-user-lena", userName: "Lena" },
  { userId: "hero-user-jonas", userName: "Jonas" },
];

const STAMP = "2026-10-01T09:00:00.000Z";
const aptId = (i) => `3f6e2a10-0000-4000-8000-00000000000${i + 1}`;
// Encryption is off for this server, so an envelope is plaintext: { v: 0, data }.
const plain = (data) => ({ v: 0, data });

function apartmentRows() {
  return APARTMENTS.map((a, i) => {
    const fields = { ...a };
    delete fields.ratings;
    return {
      id: aptId(i),
      version: 1,
      envelope: plain({
        summary: null, listingUrl: null, rawExtractedData: null, userEditedFields: [],
        latitude: null, longitude: null, listingGone: false, listingCheckedAt: null, pdf: null,
        ...fields,
      }),
      createdAt: STAMP,
      updatedAt: STAMP,
    };
  });
}

function ratingRows() {
  return APARTMENTS.flatMap((a, i) =>
    PEOPLE.map((p, j) => {
      const [kitchen, balconies, location, floorplan, overallFeeling] = a.ratings[j];
      return {
        apartmentId: aptId(i),
        userId: p.userId,
        userName: p.userName,
        envelope: plain({ kitchen, balconies, location, floorplan, overallFeeling, comment: "" }),
        updatedAt: STAMP,
      };
    })
  );
}

function locationRows() {
  return LOCATIONS.map((l, i) => ({
    id: l.id,
    sortOrder: i,
    envelope: plain({ label: l.label, icon: l.icon, address: l.address, latitude: null, longitude: null }),
    createdAt: STAMP,
    updatedAt: STAMP,
  }));
}

// ── The run ───────────────────────────────────────────────────────────────
function startServer() {
  rmSync(DB_FILE, { force: true });
  const env = {
    ...process.env,
    TURSO_DATABASE_URL: "",
    TURSO_AUTH_TOKEN: "",
    LOCAL_DB_URL: `file:./${DB_FILE}`,
    FLATPARE_ENCRYPTION: "off",
    FLATPARE_PUBLIC_ACCESS: "open",
    APP_PASSWORD: PASSWORD,
    AUTH_SECRET: process.env.AUTH_SECRET || "hero-capture-secret-not-for-real-use",
    AUTH_TRUST_HOST: "true",
    GOOGLE_CLIENT_ID: "",
    GITHUB_CLIENT_ID: "",
    RESEND_API_KEY: "",
    STRIPE_SECRET_KEY: "",
  };
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  return { server, log: () => log };
}

async function waitFor(check, what, ms = 60_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${what}`);
}

const { server, log } = startServer();
let browser;
try {
  await waitFor(async () => (await fetch(`${BASE}/`)).ok, "the server");
  await waitFor(async () => /\[db\]/.test(log()), "the database line");
  if (!/\[db\] local file/.test(log())) {
    throw new Error(`refusing to continue: the server did not report a local database:\n${log()}`);
  }

  // The account the shared password signs into, created ahead of the first
  // sign-in so the nav shows a person's name rather than "Self-hosted" —
  // which is what a hosted user sees. The server has migrated the file by
  // now; the email is the one findOrCreateSelfHostedUser looks up.
  const db = createClient({ url: `file:./${DB_FILE}` });
  await db.execute({
    sql: "INSERT INTO users (id, name, email) VALUES (?, ?, ?)",
    args: ["hero-user-lena", "Lena", "self-hosted@flatpare.local"],
  });
  db.close();

  browser = await chromium.launch();
  mkdirSync(OUT_DIR, { recursive: true });

  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: theme });
    await context.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
    const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    await context.route("**/api/apartments", (r) => (r.request().method() === "GET" ? r.fulfill(json(apartmentRows())) : r.continue()));
    await context.route("**/api/ratings", (r) => r.fulfill(json(ratingRows())));
    await context.route("**/api/locations", (r) => (r.request().method() === "GET" ? r.fulfill(json(locationRows())) : r.continue()));

    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    try {
      await page.goto(`${BASE}/`);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForURL("**/apartments");
      await page.goto(`${BASE}/compare`);
      await page.getByRole("table").waitFor();
      // Let fonts and the theme settle.
      await page.waitForTimeout(800);

      const png = await page.screenshot();
      const out = `${OUT_DIR}/compare-${theme}.webp`;
      await sharp(png).resize({ width: 1600 }).webp({ quality: 86 }).toFile(out);
      console.log(`[capture-hero] wrote ${out}`);
    } catch (err) {
      await page.screenshot({ path: `data/hero-capture-failure-${theme}.png` }).catch(() => {});
      console.error(`[capture-hero] failed at ${page.url()}; see data/hero-capture-failure-${theme}.png`);
      throw err;
    }
    await context.close();
  }
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  rmSync(DB_FILE, { force: true });
}
