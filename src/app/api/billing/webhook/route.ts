import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { CREDITS_PER_PURCHASE, billingEnabled, recordPaymentOnce } from "@/lib/billing";
import { stripe } from "@/lib/stripe";
import { scrubbedErrorLine } from "@/lib/log-scrub";

// The only thing in this application that grants credits.
//
// UNAUTHENTICATED BY NECESSITY: Stripe has no session and no cookie, so this
// route is deliberately excluded from the gate in src/proxy.ts. Its ONLY
// authentication is the signature over the raw body. That makes two rules
// absolute:
//
//   1. Read the RAW body (req.text()). req.json() re-serializes, and the
//      signature is over the exact bytes Stripe sent.
//   2. Verify before trusting anything. Until constructEvent returns, the
//      body is attacker-controlled input that merely looks like Stripe.
//
// Idempotency lives in recordPaymentOnce: the payments table is keyed on the
// Stripe event id, so a redelivery — which Stripe does routinely, since
// delivery is at-least-once — is a no-op rather than a second 40 credits.
export async function POST(req: Request) {
  if (!billingEnabled()) {
    return NextResponse.json({ error: "Billing is not enabled" }, { status: 404 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    // Loud, because the failure is silent otherwise: customers would pay and
    // receive nothing, with no error anywhere in the app.
    console.error("[billing:webhook] STRIPE_WEBHOOK_SECRET is not set — cannot verify events");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const raw = await req.text();
    event = stripe().webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    // Never echo the error: for a signature failure it can quote the payload,
    // which is attacker-supplied. Class only (E4's rule).
    console.error(`[billing:webhook] signature verification failed: ${scrubbedErrorLine(err)}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (event.type !== "checkout.session.completed") {
      // Acknowledge everything else, or Stripe retries it forever.
      return NextResponse.json({ received: true, ignored: event.type });
    }

    const session = event.data.object as Stripe.Checkout.Session;

    // An unpaid completed session is possible (async payment methods). Only
    // money that actually moved buys anything.
    if (session.payment_status !== "paid") {
      return NextResponse.json({ received: true, ignored: "unpaid" });
    }

    const householdId = Number(
      session.client_reference_id ?? session.metadata?.householdId ?? NaN
    );
    if (!Number.isInteger(householdId) || householdId <= 0) {
      // 200, not 4xx: retrying will not fix a session we cannot attribute,
      // and Stripe would retry for days. Logged for manual reconciliation
      // against the ledger.
      console.error("[billing:webhook] paid session with no usable household id");
      return NextResponse.json({ received: true, ignored: "unattributable" });
    }

    const granted = await recordPaymentOnce({
      eventId: event.id,
      householdId,
      stripeCustomer:
        typeof session.customer === "string" ? session.customer : null,
      stripeSession: session.id,
      amountCents: session.amount_total ?? 0,
      currency: session.currency ?? "chf",
      credits: CREDITS_PER_PURCHASE,
    });

    return NextResponse.json({ received: true, granted });
  } catch (err) {
    // 500 so Stripe retries: a database blip should not cost the customer
    // their purchase, and the ledger's event-id key makes the retry safe.
    console.error(`[billing:webhook] processing failed: ${scrubbedErrorLine(err)}`);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
