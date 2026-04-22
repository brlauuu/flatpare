import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/apartments",
  useRouter: () => ({ push, refresh }),
}));

import { NavBar } from "../nav-bar";

type FetchCall = { url: string; init: RequestInit };
let fetchCalls: FetchCall[] = [];

function mockFetch(
  routes: Record<string, () => Partial<Response>> = {}
) {
  // Match longer (more specific) patterns first so `/api/auth/users/Alice`
  // takes precedence over `/api/auth/users`.
  const patterns = Object.entries(routes).sort(
    ([a], [b]) => b.length - a.length
  );
  return vi.spyOn(global, "fetch").mockImplementation(((
    input: RequestInfo,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    fetchCalls.push({ url, init: init ?? {} });
    for (const [pattern, build] of patterns) {
      if (url.includes(pattern)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
          ...build(),
        } as Response);
      }
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);
  }) as typeof fetch);
}

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  fetchCalls = [];
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NavBar users dropdown", () => {
  it("opens the dropdown and lists all users (including current with a 'you' marker)", async () => {
    const user = userEvent.setup();
    mockFetch({
      "/api/auth/users": () => ({
        json: () => Promise.resolve(["Alice", "Bob"]),
      }),
    });

    render(<NavBar userName="Alice" />);

    await user.click(screen.getByRole("button", { name: /Alice/i }));

    await waitFor(() => {
      expect(screen.getByText("Users")).toBeInTheDocument();
    });
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText(/\(you\)/)).toBeInTheDocument();
  });

  it("tolerates a non-array response from /api/auth/users", async () => {
    const user = userEvent.setup();
    mockFetch({
      "/api/auth/users": () => ({
        json: () => Promise.resolve({ error: "unexpected" }),
      }),
    });

    render(<NavBar userName="Alice" />);

    await user.click(screen.getByRole("button", { name: /Alice/i }));

    await waitFor(() => {
      expect(screen.getByText("Users")).toBeInTheDocument();
    });
    expect(screen.getByText("No users")).toBeInTheDocument();
  });

  it("navigates to /add-user when 'Add new user' is clicked", async () => {
    const user = userEvent.setup();
    mockFetch({
      "/api/auth/users": () => ({
        json: () => Promise.resolve(["Alice"]),
      }),
    });

    render(<NavBar userName="Alice" />);

    await user.click(screen.getByRole("button", { name: /Alice/i }));
    await user.click(await screen.findByText("Add new user"));

    expect(push).toHaveBeenCalledWith("/add-user");
  });

  it("clicking another user POSTs /api/auth/name and refreshes", async () => {
    const user = userEvent.setup();
    mockFetch({
      "/api/auth/users": () => ({
        json: () => Promise.resolve(["Alice", "Bob"]),
      }),
    });

    render(<NavBar userName="Alice" />);

    await user.click(screen.getByRole("button", { name: /Alice/i }));
    await user.click(await screen.findByText("Bob"));

    await waitFor(() => {
      const postCall = fetchCalls.find(
        (c) => c.url.endsWith("/api/auth/name") && c.init.method === "POST"
      );
      expect(postCall?.init.body).toBe(
        JSON.stringify({ displayName: "Bob" })
      );
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("clicking the ✕ on another user DELETEs them and refreshes", async () => {
    const user = userEvent.setup();
    mockFetch({
      "/api/auth/users": () => ({
        json: () => Promise.resolve(["Alice", "Bob"]),
      }),
      "/api/auth/users/Bob": () => ({
        json: () => Promise.resolve({ switchedTo: undefined }),
      }),
    });

    render(<NavBar userName="Alice" />);

    await user.click(screen.getByRole("button", { name: /Alice/i }));
    await user.click(
      await screen.findByRole("button", { name: /Delete Bob/i })
    );

    await waitFor(() => {
      const del = fetchCalls.find(
        (c) => c.url.endsWith("/api/auth/users/Bob") && c.init.method === "DELETE"
      );
      expect(del).toBeDefined();
    });
    expect(refresh).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("deleting the last user navigates home", async () => {
    const user = userEvent.setup();
    mockFetch({
      "/api/auth/users": () => ({
        json: () => Promise.resolve(["Alice"]),
      }),
      "/api/auth/users/Alice": () => ({
        json: () => Promise.resolve({ switchedTo: null }),
      }),
    });

    render(<NavBar userName="Alice" />);

    await user.click(screen.getByRole("button", { name: /Alice/i }));
    await user.click(
      await screen.findByRole("button", { name: /Delete Alice/i })
    );

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/");
    });
  });
});
