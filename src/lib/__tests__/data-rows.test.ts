/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { apartmentRow, isoOf, locationRow, parseStoredEnvelope, ratingRow } from "@/lib/data-rows";

// Pure row shaping, reached by every read route. It sat at 50% branch because
// the null fallbacks only fire on an in-memory insert (before the timestamp
// default lands) and on a user with no name — neither of which any route test
// produces.

const ENVELOPE = { v: 1 as const, iv: "aXY=", ct: "Y3Q=" };
const TEXT = JSON.stringify(ENVELOPE);
const AT = new Date("2026-09-16T00:00:00.000Z");

describe("isoOf", () => {
  it("formats a date as ISO", () => {
    expect(isoOf(AT)).toBe("2026-09-16T00:00:00.000Z");
  });

  it("falls back to now when the timestamp is null", () => {
    // Drizzle hands back null before the column default fires on an in-memory
    // insert. The wire type is a required string, so a null would otherwise
    // reach the client as "null".
    const before = Date.now();
    const out = isoOf(null);
    expect(Date.parse(out)).toBeGreaterThanOrEqual(before);
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("parseStoredEnvelope", () => {
  it("round-trips the stored text", () => {
    expect(parseStoredEnvelope(TEXT)).toEqual(ENVELOPE);
  });

  it("parses a v0 (encryption off) envelope too", () => {
    expect(parseStoredEnvelope('{"v":0,"data":{"name":"x"}}')).toEqual({
      v: 0,
      data: { name: "x" },
    });
  });
});

describe("apartmentRow", () => {
  it("shapes a stored record for the wire", () => {
    expect(
      apartmentRow({
        id: "a1",
        householdId: 1,
        version: 3,
        envelope: TEXT,
        createdAt: AT,
        updatedAt: AT,
      })
    ).toEqual({
      id: "a1",
      version: 3,
      envelope: ENVELOPE,
      createdAt: AT.toISOString(),
      updatedAt: AT.toISOString(),
    });
  });

  it("never leaks householdId onto the wire", () => {
    // The client already knows its own household; echoing it back is surface
    // for no benefit.
    const row = apartmentRow({
      id: "a1",
      householdId: 99,
      version: 1,
      envelope: TEXT,
      createdAt: AT,
      updatedAt: AT,
    });
    expect(row).not.toHaveProperty("householdId");
  });
});

describe("ratingRow", () => {
  it("carries the rater's name through", () => {
    const row = ratingRow({
      apartmentId: "a1",
      userId: "u1",
      userName: "Ana",
      householdId: 1,
      envelope: TEXT,
      createdAt: AT,
      updatedAt: AT,
    });
    expect(row).toMatchObject({ apartmentId: "a1", userId: "u1", userName: "Ana" });
  });

  it("falls back to 'Member' for a user with no name", () => {
    // OAuth providers do not always supply one, and the comparison table
    // renders this string next to the scores.
    const row = ratingRow({
      apartmentId: "a1",
      userId: "u1",
      userName: null,
      householdId: 1,
      envelope: TEXT,
      createdAt: AT,
      updatedAt: AT,
    });
    expect(row.userName).toBe("Member");
  });
});

describe("locationRow", () => {
  it("keeps sortOrder, which is the one ordering the server owns", () => {
    const row = locationRow({
      id: "l1",
      householdId: 1,
      sortOrder: 2,
      envelope: TEXT,
      createdAt: AT,
      updatedAt: AT,
    });
    expect(row).toMatchObject({ id: "l1", sortOrder: 2, envelope: ENVELOPE });
    expect(row).not.toHaveProperty("householdId");
  });
});
