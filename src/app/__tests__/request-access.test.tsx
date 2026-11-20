import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RequestAccess } from "../request-access";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RequestAccess", () => {
  it("sends the filled-in address to the beta requests endpoint and says what happens next", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const user = userEvent.setup();
    render(<RequestAccess refused initialEmail="ana@example.com" onBack={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Request access" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/email you a beta link/i);
    expect(screen.getByRole("heading", { name: /request sent/i })).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/beta-requests");
    expect(JSON.parse(String(init.body))).toEqual({ email: "ana@example.com", website: "" });
  });

  it("shows a fixed message when the server refuses, and keeps the form", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "x" }), { status: 429 }));
    const user = userEvent.setup();
    render(<RequestAccess refused={false} onBack={() => {}} />);
    await user.type(screen.getByLabelText("Email"), "ana@example.com");
    await user.click(screen.getByRole("button", { name: "Request access" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/try again tomorrow/i);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("explains what to do with a beta link only when asked", async () => {
    const user = userEvent.setup();
    render(<RequestAccess refused onBack={() => {}} />);
    const toggle = screen.getByRole("button", { name: /i have a beta link/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/open the link from your invitation email/i)).not.toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/open the link from your invitation email/i)).toBeInTheDocument();
  });

  it("goes back to sign in, also after sending", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<RequestAccess refused initialEmail="ana@example.com" onBack={onBack} />);
    await user.click(screen.getByRole("button", { name: /back to sign in/i }));
    await user.click(screen.getByRole("button", { name: "Request access" }));
    await screen.findByRole("status");
    await user.click(screen.getByRole("button", { name: /back to sign in/i }));
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it("keeps the honeypot out of reach of people and assistive technology", () => {
    render(<RequestAccess refused onBack={() => {}} />);
    const trap = document.getElementById("request-website")!;
    expect(trap).toHaveAttribute("tabindex", "-1");
    expect(trap.closest("[aria-hidden='true']")).not.toBeNull();
  });
});
