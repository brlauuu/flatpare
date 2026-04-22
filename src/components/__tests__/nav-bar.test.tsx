import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/apartments",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { NavBar } from "../nav-bar";

beforeEach(() => {
  vi.spyOn(global, "fetch").mockImplementation(((input: RequestInfo) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.endsWith("/api/auth/users")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(["Alice", "Bob"]),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  }) as typeof fetch);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NavBar users dropdown", () => {
  it("opens the users dropdown without throwing when a label is present", async () => {
    await act(async () => {
      render(<NavBar userName="Alice" />);
    });

    const trigger = screen.getByRole("button", { name: /Alice/i });

    // Opening the menu would previously crash because DropdownMenuLabel
    // (base-ui Menu.GroupLabel) requires a Menu.Group ancestor.
    await act(async () => {
      trigger.click();
    });

    await waitFor(() => {
      expect(screen.getByText("Switch user")).toBeInTheDocument();
    });

    // Other users (from mocked fetch, minus current) should render.
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("tolerates a non-array response from /api/auth/users without crashing", async () => {
    vi.spyOn(global, "fetch").mockImplementation((() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ error: "unexpected" }),
      } as Response)) as typeof fetch);

    await act(async () => {
      render(<NavBar userName="Alice" />);
    });

    const trigger = screen.getByRole("button", { name: /Alice/i });

    await act(async () => {
      trigger.click();
    });

    await waitFor(() => {
      expect(screen.getByText("Switch user")).toBeInTheDocument();
    });

    expect(screen.getByText("No other users")).toBeInTheDocument();
  });
});
