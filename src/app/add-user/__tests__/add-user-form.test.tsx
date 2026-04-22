import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
const refresh = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh, back }),
}));

import { AddUserForm } from "../add-user-form";

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  back.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AddUserForm", () => {
  it("submits the display name and navigates to /apartments", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response);

    render(<AddUserForm />);

    await user.type(screen.getByLabelText(/Display name/i), "Lara");
    await user.click(screen.getByRole("button", { name: /Enter/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/name",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ displayName: "Lara" }),
        })
      );
    });
    expect(push).toHaveBeenCalledWith("/apartments");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows an error and does not navigate when the API fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "boom" }),
    } as Response);

    render(<AddUserForm />);

    await user.type(screen.getByLabelText(/Display name/i), "Lara");
    await user.click(screen.getByRole("button", { name: /Enter/i }));

    await waitFor(() => {
      expect(screen.getByText("Failed to set name")).toBeInTheDocument();
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("cancel button goes back", async () => {
    const user = userEvent.setup();
    render(<AddUserForm />);

    await user.click(screen.getByRole("button", { name: /Cancel/i }));

    expect(back).toHaveBeenCalled();
  });
});
