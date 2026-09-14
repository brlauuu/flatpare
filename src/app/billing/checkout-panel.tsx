"use client";

import { useCallback, useEffect, useState } from "react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";
import { ErrorDisplay } from "@/components/error-display";

// The publishable key is safe in client code — that is what "publishable"
// means. The secret key never leaves the server.
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
);

// Embedded Checkout: the payment form renders here rather than redirecting to
// Stripe, and `redirect_on_completion: "never"` means there is no return URL.
//
// That removes a whole class of problem — there is no redirect to forge, and
// no "?success=true" the client could be tricked into believing. It also
// means completion is not observable from the browser in any trustworthy way,
// so this polls /api/billing/status and waits for the WEBHOOK to have granted
// the credits. The server's word, not Stripe's redirect, not the client's.
const POLL_MS = 2000;
const POLL_TIMEOUT_MS = 90_000;

export function CheckoutPanel() {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);

  const start = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      if (!res.ok) throw new Error(`Checkout failed (${res.status})`);
      const body = (await res.json()) as { clientSecret: string | null };
      if (!body.clientSecret) throw new Error("Stripe returned no session");
      setClientSecret(body.clientSecret);
    } catch {
      setError("Couldn't start checkout. Please try again.");
    }
  }, []);

  // Once the form is on screen, watch for the webhook's grant. Cleared on
  // unmount so a completed purchase in another tab cannot leave a timer
  // running against a gone component.
  useEffect(() => {
    if (!clientSecret) return;
    let cancelled = false;
    const startedAt = Date.now();

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/billing/status", { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as { granted: number };
          if (body.granted > 0) {
            // Full navigation, so the layout gate re-runs server-side and
            // lets us through rather than trusting client state.
            window.location.assign("/apartments");
            return;
          }
        }
      } catch {
        // A failed poll is not a failed purchase; keep waiting.
      }
      if (!cancelled && Date.now() - startedAt < POLL_TIMEOUT_MS) {
        setTimeout(tick, POLL_MS);
      } else if (!cancelled) {
        setWaiting(true);
      }
    };

    const id = setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [clientSecret]);

  if (error) {
    return (
      <div className="space-y-3">
        <ErrorDisplay headline={error} />
        <Button onClick={start}>Try again</Button>
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <Button className="h-11 w-full sm:w-auto" onClick={start}>
        Buy 40 apartments — CHF 5
      </Button>
    );
  }

  return (
    <div className="space-y-4">
      <div id="checkout">
        <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>
      {waiting && (
        <p className="text-sm text-muted-foreground">
          Payment received, but we haven&apos;t heard from Stripe yet. This
          usually takes a few seconds. Your purchase is safe — reload this page
          in a minute and it will be here.
        </p>
      )}
    </div>
  );
}
