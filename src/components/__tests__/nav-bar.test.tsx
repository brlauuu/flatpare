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

import { NavBar } from "../nav-bar";
import { setUnsavedRating } from "@/lib/unsaved-changes";

beforeEach(() => {
  signOutMock.mockReset();
  signOutMock.mockResolvedValue(undefined);
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
