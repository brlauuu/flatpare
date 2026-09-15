import { createClient } from "@libsql/client";
import Stripe from "stripe";
import { expect, test } from "playwright/test";

// The committed version of the hand-run checkout that found three shipped
// defects the unit tests could not (#238). All three lived in
// `checkout.sessions.create` against the real Stripe API, which the unit tests
// mock — so the load-bearing part of this file is that it makes that call for
// real and then inspects what Stripe actually created.
//
// What this covers that unit tests cannot:
//   - the session is accepted by the live API at all (tax_code present,
//     ui_mode still valid) — defects 1 and 2
//   - the customer is charged CHF 5, not CHF 5 plus VAT — defect 3
//   - the purchase gate, the poll, and the navigation back into the app,
//     driven through a real browser against a real server and database
//
// What it deliberately does NOT cover: entering a card in Stripe's iframe.
// That needs `stripe listen` forwarding a real event from Stripe's
// infrastructure, which makes the suite depend on an external process and a
// network round trip we cannot make deterministic. Instead the webhook is
// delivered here, signed with the same secret the server verifies against —
// so everything the application owns is exercised end to end, and only
// Stripe's own card form is out of frame.

const SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const WEBHOOK_SECRET = process.env.E2E_WEBHOOK_SECRET ?? "whsec_e2e_local";
const PASSWORD = process.env.E2E_APP_PASSWORD ?? "e2e-password";
const DB_URL = "file:./data/e2e.db";

// Skip rather than fail: a checkout cannot be created without a real test key,
// and a red suite for an absent optional credential trains people to ignore it.
test.skip(
  !SECRET_KEY.startsWith("sk_test_"),
  "STRIPE_SECRET_KEY must be a Stripe test key (sk_test_...) — see e2e/README.md"
);

async function householdId(): Promise<number> {
  const db = createClient({ url: DB_URL });
  try {
    const rows = await db.execute("SELECT id FROM households ORDER BY id LIMIT 1");
    const id = rows.rows[0]?.id;
    if (typeof id !== "number" && typeof id !== "bigint") {
      throw new Error("No household in the e2e database — did sign-in run?");
    }
    return Number(id);
  } finally {
    db.close();
  }
}

// Delivers a checkout.session.completed the server will accept, signed the way
// Stripe signs. Deliberately goes through the real route so the signature
// check, the raw-body read and the ledger's idempotency all run for real.
async function deliverWebhook(
  session: Stripe.Checkout.Session,
  eventId: string
): Promise<Response> {
  const payload = JSON.stringify({
    id: eventId,
    object: "event",
    type: "checkout.session.completed",
    data: { object: { ...session, payment_status: "paid" } },
  });
  const header = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
  return fetch("http://localhost:3002/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": header, "content-type": "application/json" },
    body: payload,
  });
}

test.describe("billing", () => {
  test("a household that has never purchased is gated to /billing", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: /sign in|continue/i }).click();

    // The gate lives in the four signed-in layouts, so landing anywhere inside
    // the app has to bounce here.
    await page.waitForURL("**/billing", { timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: /one payment, then it's yours/i })
    ).toBeVisible();
  });

  test("the live Stripe API accepts the session, at CHF 5 inclusive", async ({
    page,
  }) => {
    await page.goto("/billing");

    // Capture what our own route handed back, then ask Stripe what it actually
    // created. Asserting against Stripe rather than against our request is the
    // whole point: defects 1-3 were all cases where the API's answer differed
    // from what the code assumed.
    const response = page.waitForResponse(
      (r) => r.url().includes("/api/billing/checkout") && r.request().method() === "POST"
    );
    await page.getByRole("button", { name: /buy 40 apartments/i }).click();
    const res = await response;

    // A non-200 here IS defect 1 or 2 recurring — the API rejecting the shape.
    expect(
      res.status(),
      "Stripe rejected the checkout session — see #238 for the shapes that have failed before"
    ).toBe(200);
    const { clientSecret } = (await res.json()) as { clientSecret: string };
    expect(clientSecret).toBeTruthy();

    const stripe = new Stripe(SECRET_KEY);
    // The client secret is "<session_id>_secret_<...>".
    const sessionId = clientSecret.split("_secret_")[0];
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items"],
    });

    expect(session.mode, "must never become a subscription").toBe("payment");
    expect(session.currency).toBe("chf");
    // Defect 3: Managed Payments adds VAT on top unless tax_behavior is
    // inclusive, which billed CHF 6.15 against a page advertising CHF 5.
    expect(
      session.amount_total,
      "the customer must pay exactly the CHF 5 the landing page advertises"
    ).toBe(500);
    expect(session.line_items?.data[0]?.price?.tax_behavior).toBe("inclusive");

    // The embedded form renders in an iframe from Stripe rather than a redirect.
    await expect(page.locator("#checkout iframe")).toBeVisible();
  });

  test("the webhook grants credits and the app opens", async ({ page }) => {
    const hid = await householdId();
    const stripe = new Stripe(SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
      redirect_on_completion: "never",
      mode: "payment",
      client_reference_id: String(hid),
      line_items: [
        {
          price_data: {
            currency: "chf",
            product_data: { name: "Flatpare — 40 apartments", tax_code: "txcd_10103000" },
            unit_amount: 500,
            tax_behavior: "inclusive",
          },
          quantity: 1,
        },
      ],
    });

    await page.goto("/billing");
    await page.getByRole("button", { name: /buy 40 apartments/i }).click();
    await expect(page.locator("#checkout iframe")).toBeVisible();

    const eventId = `evt_e2e_${Date.now()}`;
    const first = await deliverWebhook(session, eventId);
    expect(first.status).toBe(200);
    // `granted` here is recordPaymentOnce's boolean "did this event do work",
    // not a credit count — the count is asserted against /status below.
    expect(await first.json()).toMatchObject({ received: true, granted: true });

    // The panel polls /api/billing/status and navigates on the server's word,
    // never on a redirect from Stripe.
    await page.waitForURL("**/apartments", { timeout: 30_000 });

    // Redelivery is routine — Stripe's delivery is at-least-once — and must
    // not be a second 40 credits. The ledger is keyed on the event id.
    const replay = await deliverWebhook(session, eventId);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ received: true, granted: false });

    // The real proof the redelivery granted nothing: still 40, not 80.
    const status = await page.request.get("/api/billing/status");
    expect(await status.json()).toMatchObject({ granted: 40, enabled: true });
  });
});
