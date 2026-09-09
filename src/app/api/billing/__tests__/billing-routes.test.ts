/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apartments, households, householdMembers, payments } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { UnauthorizedError } from "@/lib/household";

const WEBHOOK_SECRET = "whsec_test_secret_for_signing";

const currentSession = { householdId: 0, userId: "", role: "owner" as "owner" | "member" };
let signedIn = true;
vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => {
    if (!signedIn) throw new UnauthorizedError();
    return { ...currentSession };
  }),
}));

// The Checkout session is created against Stripe's API, which we do not call
// in tests. The WEBHOOK path is NOT mocked — it uses the real SDK to verify a
// real signature, because that verification is the route's only
// authentication and mocking it would test nothing.
const sessionsCreate = vi.fn();
vi.mock("@/lib/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe")>();
  const real = new Stripe("sk_test_dummy_key_for_signature_verification_only");
  return {
    ...actual,
    stripe: () => ({
      checkout: { sessions: { create: sessionsCreate } },
      webhooks: real.webhooks,
    }),
  };
});

import { POST as checkoutPOST } from "../checkout/route";
import { POST as webhookPOST } from "../webhook/route";

const ORIGINAL = {
  key: process.env.STRIPE_SECRET_KEY,
  secret: process.env.STRIPE_WEBHOOK_SECRET,
};

let hid: number;

/** A genuinely signed request, exactly as Stripe would send it. */
function signedRequest(payload: unknown, secret = WEBHOOK_SECRET): Request {
  const body = JSON.stringify(payload);
  const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret });
  return new Request("http://localhost/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": header, "content-type": "application/json" },
    body,
  });
}

function completedSessionEvent(over: Record<string, unknown> = {}, eventId = "evt_1") {
  return {
    id: eventId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        payment_status: "paid",
        client_reference_id: String(hid),
        customer: "cus_123",
        amount_total: 500,
        currency: "chf",
        metadata: { householdId: String(hid) },
        ...over,
      },
    },
  };
}

beforeEach(async () => {
  signedIn = true;
  sessionsCreate.mockReset();
  await db.delete(payments);
  await db.delete(apartments);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users);
  await db.insert(users).values({ id: "o", email: "o@example.com" });
  const [h] = await db.insert(households).values({ name: "H", ownerId: "o" }).returning();
  hid = h.id;
  await db.insert(householdMembers).values({ householdId: hid, userId: "o", role: "owner" });
  currentSession.householdId = hid;
  currentSession.userId = "o";

  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

afterEach(() => {
  for (const [k, v] of [
    ["STRIPE_SECRET_KEY", ORIGINAL.key],
    ["STRIPE_WEBHOOK_SECRET", ORIGINAL.secret],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

async function credits() {
  const [row] = await db
    .select({
      granted: households.apartmentCreditsGranted,
      used: households.apartmentsEverAdded,
    })
    .from(households)
    .where(eq(households.id, hid));
  return row;
}

describe("POST /api/billing/checkout", () => {
  it("returns a client secret and grants nothing", async () => {
    sessionsCreate.mockResolvedValue({ client_secret: "cs_secret_abc" });

    const res = await checkoutPOST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ clientSecret: "cs_secret_abc" });
    // The whole point: paying is what grants credits, not asking to pay.
    expect((await credits()).granted).toBe(0);
    expect(await db.select().from(payments)).toHaveLength(0);
  });

  it("creates a one-time CHF 5 session tied to the household", async () => {
    sessionsCreate.mockResolvedValue({ client_secret: "cs_secret_abc" });
    await checkoutPOST();

    const args = sessionsCreate.mock.calls[0][0];
    expect(args.mode).toBe("payment"); // never "subscription"
    expect(args.line_items[0].price_data.currency).toBe("chf");
    expect(args.line_items[0].price_data.unit_amount).toBe(500);
    expect(args.client_reference_id).toBe(String(hid));
    expect(args.metadata.householdId).toBe(String(hid));
    // No redirect exists, so no redirect can be forged.
    expect(args.redirect_on_completion).toBe("never");
  });

  it("401s without a session", async () => {
    signedIn = false;
    expect((await checkoutPOST()).status).toBe(401);
  });

  it("404s when billing is off, so a self-hoster cannot reach a paywall", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await checkoutPOST();
    expect(res.status).toBe(404);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/billing/webhook", () => {
  it("grants credits for a genuinely signed paid session", async () => {
    const res = await webhookPOST(signedRequest(completedSessionEvent()));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, granted: true });
    expect((await credits()).granted).toBe(40);

    const [row] = await db.select().from(payments);
    expect(row).toMatchObject({
      id: "evt_1",
      householdId: hid,
      amountCents: 500,
      currency: "chf",
      creditsGranted: 40,
      stripeSession: "cs_test_1",
      stripeCustomer: "cus_123",
    });
  });

  describe("the signature is the only authentication", () => {
    it("rejects a body signed with the wrong secret", async () => {
      const res = await webhookPOST(
        signedRequest(completedSessionEvent(), "whsec_attacker_secret")
      );
      expect(res.status).toBe(400);
      expect((await credits()).granted).toBe(0);
    });

    it("rejects an unsigned request", async () => {
      const res = await webhookPOST(
        new Request("http://localhost/api/billing/webhook", {
          method: "POST",
          body: JSON.stringify(completedSessionEvent()),
        })
      );
      expect(res.status).toBe(400);
      expect((await credits()).granted).toBe(0);
    });

    it("rejects a body altered after signing", async () => {
      // Sign one payload, send a different one — the exact attack the raw
      // body requirement exists to stop.
      const signed = JSON.stringify(completedSessionEvent());
      const header = Stripe.webhooks.generateTestHeaderString({
        payload: signed,
        secret: WEBHOOK_SECRET,
      });
      const tampered = signed.replace('"amount_total":500', '"amount_total":1');
      const res = await webhookPOST(
        new Request("http://localhost/api/billing/webhook", {
          method: "POST",
          headers: { "stripe-signature": header },
          body: tampered,
        })
      );
      expect(res.status).toBe(400);
      expect((await credits()).granted).toBe(0);
    });

    it("does not log the payload when verification fails", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      await webhookPOST(
        signedRequest(completedSessionEvent({ client_reference_id: "SECRET-MARKER" }), "wrong")
      );
      const logged = spy.mock.calls
        .flat()
        .map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a)))
        .join("\n");
      expect(logged).not.toContain("SECRET-MARKER");
      spy.mockRestore();
    });
  });

  describe("idempotency — Stripe delivers at least once", () => {
    it("grants once when the same event arrives twice", async () => {
      const event = completedSessionEvent();
      const first = await webhookPOST(signedRequest(event));
      const second = await webhookPOST(signedRequest(event));

      expect(await first.json()).toEqual({ received: true, granted: true });
      expect(await second.json()).toEqual({ received: true, granted: false });
      expect(second.status).toBe(200); // acknowledged, or Stripe retries forever
      expect((await credits()).granted).toBe(40);
      expect(await db.select().from(payments)).toHaveLength(1);
    });

    it("grants twice for two genuinely different purchases", async () => {
      await webhookPOST(signedRequest(completedSessionEvent({}, "evt_1")));
      await webhookPOST(
        signedRequest(completedSessionEvent({ id: "cs_test_2" }, "evt_2"))
      );
      expect((await credits()).granted).toBe(80);
      expect(await db.select().from(payments)).toHaveLength(2);
    });
  });

  describe("events that must not grant", () => {
    it("ignores a completed but unpaid session", async () => {
      const res = await webhookPOST(
        signedRequest(completedSessionEvent({ payment_status: "unpaid" }))
      );
      expect(await res.json()).toEqual({ received: true, ignored: "unpaid" });
      expect((await credits()).granted).toBe(0);
    });

    it("acknowledges unrelated event types without granting", async () => {
      const res = await webhookPOST(
        signedRequest({ id: "evt_x", type: "payment_intent.created", data: { object: {} } })
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ignored: "payment_intent.created" });
      expect((await credits()).granted).toBe(0);
    });

    it("acknowledges an unattributable session instead of making Stripe retry for days", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await webhookPOST(
        signedRequest(
          completedSessionEvent({ client_reference_id: null, metadata: {} })
        )
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ignored: "unattributable" });
      expect(await db.select().from(payments)).toHaveLength(0);
      spy.mockRestore();
    });
  });

  it("500s when the webhook secret is missing, rather than trusting the body", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await webhookPOST(signedRequest(completedSessionEvent()));
    expect(res.status).toBe(500);
    expect((await credits()).granted).toBe(0);
    spy.mockRestore();
  });

  it("404s when billing is off", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await webhookPOST(signedRequest(completedSessionEvent()));
    expect(res.status).toBe(404);
    expect((await credits()).granted).toBe(0);
  });
});
