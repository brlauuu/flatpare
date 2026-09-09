import Stripe from "stripe";

// The Stripe client. Server-only by construction: it reads STRIPE_SECRET_KEY,
// which is never exposed to the browser. Never import this from a "use
// client" file.
//
// Constructed lazily rather than at module load so that importing this file
// on a deployment with billing off — a self-hoster, or local dev — does not
// throw. `billingEnabled()` (src/lib/billing.ts) is the guard every caller
// checks first.
let client: Stripe | null = null;

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Callers must check billingEnabled() first."
    );
  }
  if (!client) client = new Stripe(key);
  return client;
}

// Reset between tests, which swap the key to simulate billing on and off.
export function resetStripeClientForTests(): void {
  client = null;
}

// The single offering. Inline rather than a catalog Price so the amount lives
// in code next to the landing page copy that advertises it, with a test
// asserting the two agree — a dashboard Price is a second source of truth
// that can drift from the page without anything failing.
export const PRICE_CHF_CENTS = 500;
export const PRICE_CURRENCY = "chf";
export const PRODUCT_NAME = "Flatpare — 40 apartments";
