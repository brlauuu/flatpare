/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Stripe from "stripe";
import {
  PRICE_CHF_CENTS,
  PRICE_CURRENCY,
  PRODUCT_NAME,
  PRODUCT_TAX_CODE,
  resetStripeClientForTests,
  stripe,
} from "@/lib/stripe";

// billing-routes.test.ts mocks this module wholesale and overrides the client
// factory, so the lazy-init and env branches never ran anywhere. This file
// executes the real thing — no mock of @/lib/stripe.

const ORIGINAL = process.env.STRIPE_SECRET_KEY;

beforeEach(() => {
  resetStripeClientForTests();
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy_key_for_construction_only";
});

afterEach(() => {
  resetStripeClientForTests();
  if (ORIGINAL === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = ORIGINAL;
});

describe("stripe()", () => {
  it("constructs a client when the key is set", () => {
    expect(stripe()).toBeInstanceOf(Stripe);
  });

  it("caches the client rather than constructing one per call", () => {
    // Lazy *and* memoized: a new Stripe() per request would rebuild the HTTP
    // agent and lose connection reuse.
    expect(stripe()).toBe(stripe());
  });

  it("constructs nothing until first called", () => {
    // The whole point of the laziness: importing this module on a deployment
    // with billing off must not throw. The import at the top of this file
    // already happened with no key guaranteed, and we are still here.
    delete process.env.STRIPE_SECRET_KEY;
    expect(() => stripe()).toThrow(/STRIPE_SECRET_KEY is not set/);
  });

  describe("refuses to construct without a usable key", () => {
    // Each of these is "billing is off" — a self-hoster, or local dev. The
    // error names billingEnabled() because reaching here means a caller
    // skipped that guard, and that is the bug to fix.
    it.each([
      ["unset", undefined],
      ["empty", ""],
      ["whitespace", "   "],
    ])("%s", (_label, value) => {
      if (value === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = value;

      expect(() => stripe()).toThrow(/Callers must check billingEnabled\(\) first/);
    });
  });

  it("re-reads the key on each call rather than capturing it at module load", () => {
    // Tests swap the key to simulate billing on and off; a module-load read
    // would bake the first value in for the whole process.
    delete process.env.STRIPE_SECRET_KEY;
    expect(() => stripe()).toThrow();

    process.env.STRIPE_SECRET_KEY = "sk_test_now_it_is_set";
    expect(stripe()).toBeInstanceOf(Stripe);
  });
});

describe("resetStripeClientForTests", () => {
  it("drops the cached client so a new key takes effect", () => {
    const first = stripe();
    resetStripeClientForTests();
    expect(stripe()).not.toBe(first);
  });
});

describe("the offering", () => {
  // These live in code rather than a dashboard Price specifically so they can
  // be asserted against the copy that advertises them. src/app/__tests__/
  // landing.test.tsx holds the other half.
  it("is CHF 5, as an integer number of cents", () => {
    expect(PRICE_CHF_CENTS).toBe(500);
    expect(Number.isInteger(PRICE_CHF_CENTS)).toBe(true);
    expect(PRICE_CURRENCY).toBe("chf");
  });

  it("names the product with the quota it grants", () => {
    expect(PRODUCT_NAME).toContain("40");
  });

  it("carries the tax code Managed Payments requires", () => {
    // Without this the live API rejects the session outright (#238). The
    // format matters — Stripe codes are txcd_ followed by digits.
    expect(PRODUCT_TAX_CODE).toMatch(/^txcd_\d+$/);
  });
});
