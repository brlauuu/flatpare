import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signInMock = vi.fn();
vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
}));

import { LoginForm } from "../login-form";

beforeEach(() => {
  signInMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LoginForm — provider gating", () => {
  it("renders only the Google button when only google is enabled", () => {
    render(<LoginForm providers={["google"]} />);
    expect(
      screen.getByRole("button", { name: /Continue with Google/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Continue with GitHub/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Password/i)).not.toBeInTheDocument();
  });

  it("renders only the GitHub button when only github is enabled", () => {
    render(<LoginForm providers={["github"]} />);
    expect(
      screen.getByRole("button", { name: /Continue with GitHub/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Continue with Google/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Password/i)).not.toBeInTheDocument();
  });

  it("renders only the password form when only credentials is enabled", () => {
    render(<LoginForm providers={["credentials"]} />);
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Continue with Google/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Continue with GitHub/i })
    ).not.toBeInTheDocument();
  });

  it("renders all three when all providers are enabled", () => {
    render(<LoginForm providers={["google", "github", "credentials"]} />);
    expect(
      screen.getByRole("button", { name: /Continue with Google/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Continue with GitHub/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
  });

  it("renders nothing selectable when no providers are enabled", () => {
    render(<LoginForm providers={[]} />);
    expect(
      screen.queryByRole("button", { name: /Continue with/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Password/i)).not.toBeInTheDocument();
  });
});

describe("LoginForm — OAuth buttons", () => {
  it("calls signIn(\"google\", ...) when the Google button is clicked", async () => {
    signInMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LoginForm providers={["google"]} />);
    await user.click(
      screen.getByRole("button", { name: /Continue with Google/i })
    );
    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("google", {
        callbackUrl: "/apartments",
      });
    });
  });
});

describe("LoginForm — password path", () => {
  it("shows 'Wrong password' when signIn resolves with an error", async () => {
    signInMock.mockResolvedValue({ error: "CredentialsSignin", ok: false });
    const user = userEvent.setup();
    render(<LoginForm providers={["credentials"]} />);

    await user.type(screen.getByLabelText(/Password/i), "wrong");
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText("Wrong password")).toBeInTheDocument();
    });
    expect(signInMock).toHaveBeenCalledWith("credentials", {
      password: "wrong",
      redirect: false,
      callbackUrl: "/apartments",
    });
  });

  it("shows 'Wrong password' when signIn resolves with nothing", async () => {
    signInMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LoginForm providers={["credentials"]} />);

    await user.type(screen.getByLabelText(/Password/i), "whatever");
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText("Wrong password")).toBeInTheDocument();
    });
  });

  it("navigates on success and does not show an error", async () => {
    const assignSpy = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, assign: assignSpy },
    });
    signInMock.mockResolvedValue({ error: undefined, ok: true, url: "/apartments" });
    const user = userEvent.setup();
    render(<LoginForm providers={["credentials"]} />);

    await user.type(screen.getByLabelText(/Password/i), "correct");
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith("/apartments");
    });
    expect(screen.queryByText("Wrong password")).not.toBeInTheDocument();

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });
});
