import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { readLimits } from "../limits";

const ORIGINAL = {
  members: process.env.MAX_MEMBERS,
  apartments: process.env.MAX_APARTMENTS,
};

beforeEach(() => {
  delete process.env.MAX_MEMBERS;
  delete process.env.MAX_APARTMENTS;
});

afterEach(() => {
  for (const [key, value] of [
    ["MAX_MEMBERS", ORIGINAL.members],
    ["MAX_APARTMENTS", ORIGINAL.apartments],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("readLimits", () => {
  // The self-hoster default, called out explicitly in #187 as a regression
  // that must not happen.
  it("is unlimited on both axes when neither var is set", () => {
    expect(readLimits()).toEqual({ maxMembers: null, maxApartments: null });
  });

  it("reads each var independently", () => {
    process.env.MAX_APARTMENTS = "20";
    expect(readLimits()).toEqual({ maxMembers: null, maxApartments: 20 });
    process.env.MAX_MEMBERS = "5";
    expect(readLimits()).toEqual({ maxMembers: 5, maxApartments: 20 });
  });

  it("does not consult households.tier — there is no free tier to distinguish", () => {
    // Guard against a future reintroduction of tier-based limits without a
    // deliberate decision: readLimits takes no arguments at all, so it cannot
    // vary by household.
    expect(readLimits.length).toBe(0);
  });
});
