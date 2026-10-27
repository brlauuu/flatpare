import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ServiceWorkerRegistrar } from "../service-worker-registrar";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubServiceWorker(register: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "serviceWorker", { value: { register }, configurable: true });
}

describe("ServiceWorkerRegistrar", () => {
  afterEach(() => {
    // jsdom has no serviceWorker; put that back.
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  });

  it("registers /sw.js and renders nothing", () => {
    const register = vi.fn(async () => ({}));
    stubServiceWorker(register);
    const { container } = render(<ServiceWorkerRegistrar />);
    expect(register).toHaveBeenCalledWith("/sw.js");
    expect(container.innerHTML).toBe("");
  });

  it("ignores a failed registration", async () => {
    const register = vi.fn(async () => {
      throw new Error("SecurityError");
    });
    stubServiceWorker(register);
    expect(() => render(<ServiceWorkerRegistrar />)).not.toThrow();
    await Promise.resolve();
    expect(register).toHaveBeenCalled();
  });

  it("does nothing where service workers are unsupported", () => {
    expect(() => render(<ServiceWorkerRegistrar />)).not.toThrow();
  });
});
