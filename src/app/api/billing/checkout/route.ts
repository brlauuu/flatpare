import { NextResponse } from "next/server";
import { apiErrorResponse, requireMember } from "@/lib/api-route";
import { ApiError } from "@/lib/api-error";
import { billingEnabled } from "@/lib/billing";
import {
  PRICE_CHF_CENTS,
  PRICE_CURRENCY,
  PRODUCT_NAME,
  PRODUCT_TAX_CODE,
  stripe,
} from "@/lib/stripe";

// Creates an embedded Checkout session for one CHF 5 purchase.
//
// This route grants NOTHING. It hands back a client secret so Stripe's
// embedded form can render, and that is all. Credits are granted only by
// /api/billing/webhook, after Stripe tells us the money actually moved —
// anything this route or the browser believes is unverified.
//
// `redirect_on_completion: "never"` keeps the user on flatpare.com and means
// there is no redirect URL to forge in the first place.
export async function POST() {
  try {
    const { householdId } = await requireMember();

    // Self-hosted deployments have no billing at all: no keys, no paywall,
    // and no route to buy something that is already unlimited.
    if (!billingEnabled()) throw new ApiError("Billing is not enabled", 404);

    const session = await stripe().checkout.sessions.create({
      // "embedded_page", not "embedded": the latter was retired and the API
      // rejects it outright ("The ui_mode value `embedded` is no longer
      // supported"). Vercel's Stripe guide still shows the old value.
      ui_mode: "embedded_page",
      redirect_on_completion: "never",
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: PRICE_CURRENCY,
            product_data: {
              name: PRODUCT_NAME,
              // Required: Managed Payments rejects a line item without it.
              tax_code: PRODUCT_TAX_CODE,
            },
            unit_amount: PRICE_CHF_CENTS,
            // VAT is INSIDE the CHF 5, not added on top. Without this,
            // Managed Payments adds tax to the total — a live test checkout
            // from Poland showed CHF 6.15 against a page advertising CHF 5.
            // EU consumer prices are expected to be displayed inclusive of
            // VAT, and "the price you saw is the price you pay" is the only
            // version of this that is honest.
            tax_behavior: "inclusive",
          },
          quantity: 1,
        },
      ],
      // Both, deliberately. client_reference_id is the documented field for
      // "which of my records is this", and metadata survives into the
      // PaymentIntent for support. The webhook reads whichever is present.
      client_reference_id: String(householdId),
      metadata: { householdId: String(householdId) },
    });

    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (e) {
    return apiErrorResponse(e, "billing:checkout");
  }
}
