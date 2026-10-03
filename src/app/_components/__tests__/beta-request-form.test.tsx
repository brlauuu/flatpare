import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BetaRequestForm } from "../beta-request-form";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function submit(email = "ana@example.com") {
  render(<BetaRequestForm />);
  await userEvent.type(screen.getByLabelText("Request a beta invite"), email);
  await userEvent.click(screen.getByRole("button", { name: /request invite/i }));
}

describe("BetaRequestForm", () => {
  it("posts the address with an empty honeypot and confirms", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await submit();
    expect(await screen.findByRole("status")).toHaveTextContent(/you're on the list/i);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/beta-requests");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ email: "ana@example.com", website: "" });
  });

  it("keeps the honeypot out of reach of people and assistive technology", () => {
    render(<BetaRequestForm />);
    const trap = document.getElementById("beta-website")!;
    expect(trap).toHaveAttribute("tabindex", "-1");
    expect(trap.closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("shows the server's words for the daily cap", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Too many requests today. Please try again tomorrow." }), {
        status: 429,
      })
    );
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(/try again tomorrow/i);
    // The form stays, so the person can try again.
    expect(screen.getByLabelText("Request a beta invite")).toBeInTheDocument();
  });

  it("shows a generic message for a server error, not its body", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Internal error" }), { status: 500 }));
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });

  it("says when the server could not be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);
  });

  it("copes with an error response that is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 400 }));
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });
});
