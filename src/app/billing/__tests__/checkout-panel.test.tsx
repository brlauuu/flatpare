import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Stripe's embedded form renders in an iframe from Stripe's origin, which
// jsdom cannot load and which is not ours to test. Stand it in with a marker
// so the assertions can still tell "form is on screen" from "button only".
vi.mock("@stripe/react-stripe-js", () => ({
  EmbeddedCheckoutProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="stripe-provider">{children}</div>
  ),
  EmbeddedCheckout: () => <div data-testid="stripe-form" />,
}));
vi.mock("@stripe/stripe-js", () => ({ loadStripe: () => Promise.resolve(null) }));

import { CheckoutPanel } from "../checkout-panel";

const fetchMock = vi.fn();
const assign = vi.fn();

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Routes by URL so a test can set checkout and status independently. */
function route(handlers: {
  checkout?: () => Response | Promise<Response>;
  status?: () => Response | Promise<Response>;
}) {
  fetchMock.mockImplementation((url: string) => {
    if (String(url).includes("/api/billing/checkout")) {
      return Promise.resolve(handlers.checkout?.() ?? jsonRes({ clientSecret: "cs_1" }));
    }
    if (String(url).includes("/api/billing/status")) {
      return Promise.resolve(handlers.status?.() ?? jsonRes({ granted: 0 }));
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

/**
 * Advances the panel's own clock. testing-library's `waitFor`/`findBy` poll on
 * real time, so under fake timers they never progress — every wait in this
 * file is an explicit clock advance instead, which is also what makes the
 * 2s poll interval and the 90s timeout assertable at all.
 */
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Clicks Buy and settles the checkout fetch, leaving the form on screen. */
async function startCheckout() {
  render(<CheckoutPanel />);
  fireEvent.click(screen.getByRole("button", { name: /buy 40 apartments/i }));
  await tick(0);
  expect(screen.getByTestId("stripe-form")).toBeInTheDocument();
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "location", {
    value: { ...window.location, assign },
    configurable: true,
  });
  assign.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CheckoutPanel", () => {
  it("shows only the buy button until checkout starts", () => {
    route({});
    render(<CheckoutPanel />);
    expect(
      screen.getByRole("button", { name: /buy 40 apartments — CHF 5/i })
    ).toBeInTheDocument();
    expect(screen.queryByTestId("stripe-form")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders the embedded form after a successful checkout call", async () => {
    vi.useFakeTimers();
    route({});
    await startCheckout();
    expect(screen.getByTestId("stripe-provider")).toBeInTheDocument();
  });

  it("navigates to /apartments once the WEBHOOK has granted credits", async () => {
    vi.useFakeTimers();
    let granted = 0;
    route({ status: () => jsonRes({ granted }) });
    await startCheckout();

    // Nothing yet: the grant has not landed, so the paywall must hold.
    await tick(6000);
    expect(assign).not.toHaveBeenCalled();

    // The webhook lands. The panel trusts the server's word, not Stripe's
    // redirect and not the client's own belief that payment succeeded.
    granted = 40;
    await tick(2500);
    expect(assign).toHaveBeenCalledWith("/apartments");
  });

  it("keeps polling while the status call fails, rather than giving up", async () => {
    vi.useFakeTimers();
    let calls = 0;
    route({
      status: () => {
        calls++;
        if (calls < 3) return Promise.reject(new Error("network"));
        return jsonRes({ granted: 40 });
      },
    });
    await startCheckout();

    // A failed poll is not a failed purchase — a customer whose network
    // blipped must still get through.
    await tick(10_000);
    expect(assign).toHaveBeenCalledWith("/apartments");
  });

  it("does not navigate on a non-OK status response", async () => {
    vi.useFakeTimers();
    route({ status: () => jsonRes({ granted: 40 }, 500) });
    await startCheckout();
    await tick(10_000);
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows an honest message after the poll times out", async () => {
    vi.useFakeTimers();
    route({});
    await startCheckout();

    await tick(95_000);

    // #238 corrected this copy: it used to say "Payment received", which is
    // shown on a timeout that ALSO happens when payment never succeeded.
    // Telling someone they paid when we do not know is the bug.
    expect(
      screen.getByText(/haven't heard back from Stripe yet/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/payment received/i)).not.toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it("stops polling once unmounted", async () => {
    vi.useFakeTimers();
    route({});
    await startCheckout();
    await tick(2500);
    const before = fetchMock.mock.calls.length;

    cleanup();
    await tick(10_000);

    // A purchase completed in another tab must not leave a timer navigating a
    // component that is gone.
    expect(fetchMock.mock.calls.length).toBe(before);
    expect(assign).not.toHaveBeenCalled();
  });

  describe("when starting checkout fails", () => {
    it("offers a retry instead of a dead button", async () => {
      route({ checkout: () => jsonRes({ error: "nope" }, 500) });
      const user = userEvent.setup();
      render(<CheckoutPanel />);
      await user.click(screen.getByRole("button", { name: /buy 40 apartments/i }));

      expect(await screen.findByText(/couldn't start checkout/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    });

    it("treats a 200 with no clientSecret as a failure", async () => {
      // Stripe answering without a session is not success, and rendering the
      // provider with a null secret would throw inside Stripe's code.
      route({ checkout: () => jsonRes({ clientSecret: null }) });
      const user = userEvent.setup();
      render(<CheckoutPanel />);
      await user.click(screen.getByRole("button", { name: /buy 40 apartments/i }));

      expect(await screen.findByText(/couldn't start checkout/i)).toBeInTheDocument();
      expect(screen.queryByTestId("stripe-form")).not.toBeInTheDocument();
    });

    it("recovers when the retry succeeds", async () => {
      let attempt = 0;
      route({
        checkout: () => {
          attempt++;
          return attempt === 1
            ? jsonRes({ error: "nope" }, 500)
            : jsonRes({ clientSecret: "cs_2" });
        },
      });
      const user = userEvent.setup();
      render(<CheckoutPanel />);
      await user.click(screen.getByRole("button", { name: /buy 40 apartments/i }));
      await user.click(await screen.findByRole("button", { name: /try again/i }));

      expect(await screen.findByTestId("stripe-form")).toBeInTheDocument();
    });
  });
});
