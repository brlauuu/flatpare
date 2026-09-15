/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import { households } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { grantApartmentCredits, consumeApartmentCredit } from "@/lib/billing";

// `redirect()` throws in Next, so the only way to observe it is to catch the
// throw. Mocking it keeps that legible and lets us assert the destination.
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));

import { requirePurchase } from "@/lib/billing-gate";

const ORIGINAL_KEY = process.env.STRIPE_SECRET_KEY;

let hid: number;

beforeEach(async () => {
  redirect.mockClear();
  redirect.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
  await db.delete(households);
  await db.delete(users);
  await db.insert(users).values({ id: "o", email: "o@example.com" });
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  hid = h.id;
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = ORIGINAL_KEY;
});

/** Runs the gate and reports whether it redirected, without leaking the throw. */
async function gate(): Promise<"passed" | "redirected"> {
  try {
    await requirePurchase(hid);
    return "passed";
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("NEXT_REDIRECT:")) {
      return "redirected";
    }
    throw err;
  }
}

/** Spends `n` credits the way POST /api/apartments does. */
async function spend(n: number) {
  for (let i = 0; i < n; i++) {
    const ok = await consumeApartmentCredit(hid);
    expect(ok, "fixture tried to spend a credit the household does not have").toBe(true);
  }
}

describe("requirePurchase", () => {
  // The distinction this whole file exists to pin. Gating on `remaining === 0`
  // instead of `granted === 0` would lock a paying household out of its own
  // E2EE data, which nobody — including the operator — could undo.
  describe("gates on granted, never on remaining", () => {
    it("redirects a household that has never purchased (granted 0)", async () => {
      expect(await gate()).toBe("redirected");
      expect(redirect).toHaveBeenCalledWith("/billing");
    });

    it("lets a household with credits through", async () => {
      await grantApartmentCredits(hid, 40);
      expect(await gate()).toBe("passed");
      expect(redirect).not.toHaveBeenCalled();
    });

    it("lets a household that has spent EVERY credit through", async () => {
      // The case that matters: remaining === 0, but they paid and they own
      // apartments. "Out of credits" must mean no new apartments, never no
      // access. If this test ever starts redirecting, the gate has been
      // switched to `remaining` and a paying customer is locked out.
      await grantApartmentCredits(hid, 3);
      await spend(3);

      expect(await gate()).toBe("passed");
      expect(redirect).not.toHaveBeenCalled();
    });

    it("lets a household that has overspent nothing through (partial spend)", async () => {
      await grantApartmentCredits(hid, 5);
      await spend(2);
      expect(await gate()).toBe("passed");
    });
  });

  describe("billing disabled", () => {
    it("never redirects when STRIPE_SECRET_KEY is unset", async () => {
      // The self-hosted default. A deployment that cannot take money must not
      // raise a paywall it would have no way to lift.
      delete process.env.STRIPE_SECRET_KEY;
      expect(await gate()).toBe("passed");
      expect(redirect).not.toHaveBeenCalled();
    });

    it("never redirects when STRIPE_SECRET_KEY is empty or whitespace", async () => {
      for (const value of ["", "   "]) {
        process.env.STRIPE_SECRET_KEY = value;
        expect(await gate(), `key=${JSON.stringify(value)}`).toBe("passed");
      }
      expect(redirect).not.toHaveBeenCalled();
    });
  });

  it("redirects to /billing specifically", async () => {
    await gate();
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/billing");
  });

  it("treats an unknown household as never-purchased", async () => {
    // readCreditBalance returns 0/0 for a missing row rather than throwing, so
    // the gate must still fail closed rather than waving it through.
    hid = 999_999;
    expect(await gate()).toBe("redirected");
  });
});
