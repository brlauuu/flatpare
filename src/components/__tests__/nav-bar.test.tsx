import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/apartments",
}));

const signOutMock = vi.fn();
vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

const clearKeysMock = vi.fn(async () => {});
vi.mock("@/lib/crypto", () => ({
  clearKeys: () => clearKeysMock(),
}));

import { NavBar } from "../nav-bar";
import { setUnsavedRating } from "@/lib/unsaved-changes";

beforeEach(() => {
  signOutMock.mockReset();
  signOutMock.mockResolvedValue(undefined);
  clearKeysMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NavBar user menu", () => {
  it("shows the signed-in user's name", () => {
    render(<NavBar userName="Alice" />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("signs out when 'Sign out' is clicked", async () => {
    const user = userEvent.setup();
    render(<NavBar userName="Alice" />);

    await user.click(screen.getByRole("button", { name: /Alice/i }));
    await user.click(await screen.findByText("Sign out"));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/" });
    });
    expect(clearKeysMock).toHaveBeenCalledTimes(1);
  });

  it("confirms before signing out when there is an unsaved rating", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    setUnsavedRating(true);

    const user = userEvent.setup();
    render(<NavBar userName="Alice" />);

    await user.click(screen.getByRole("button", { name: /Alice/i }));
    await user.click(await screen.findByText("Sign out"));

    expect(confirmSpy).toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();

    setUnsavedRating(false);
  });
});

describe("NavBar sections", () => {
  it("links every section, Household included (#298)", () => {
    render(<NavBar userName="Alice" />);
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"))
      .filter((h): h is string => h !== null);
    for (const href of ["/apartments", "/apartments/new", "/compare", "/household", "/settings", "/guide"]) {
      expect(hrefs).toContain(href);
    }
  });
});

describe("NavBar current section", () => {
  // The mocked pathname is /apartments. The current section is a filled
  // block (#324); aria-current is what says so to a screen reader, and what
  // the styling keys off. Both navs (desktop and mobile) carry it.
  it("marks the current section with aria-current in both navs", () => {
    render(<NavBar userName="Alice" />);
    const current = screen.getAllByRole("link", { name: "Apartments" });
    expect(current).toHaveLength(2);
    for (const link of current) expect(link.getAttribute("aria-current")).toBe("page");
    for (const link of screen.getAllByRole("link", { name: "Compare" })) {
      expect(link.hasAttribute("aria-current")).toBe(false);
    }
  });
});

describe("NavBar in print", () => {
  // The recovery kit is printed (#324): the page header has no place on it.
  it("is hidden when printed", () => {
    render(<NavBar userName="Alice" />);
    expect(document.querySelector("header")!.className).toContain("print:hidden");
  });
});
