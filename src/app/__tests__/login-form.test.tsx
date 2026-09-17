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

  it("calls signIn(\"github\", ...) when the GitHub button is clicked", async () => {
    signInMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LoginForm providers={["github"]} />);
    await user.click(
      screen.getByRole("button", { name: /Continue with GitHub/i })
    );
    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("github", {
        callbackUrl: "/apartments",
      });
    });
  });

  it("surfaces an error when the provider cannot be reached", async () => {
    // The catch branch: signIn rejecting rather than resolving with an error.
    signInMock.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<LoginForm providers={["google"]} />);
    await user.click(
      screen.getByRole("button", { name: /Continue with Google/i })
    );
    expect(
      await screen.findByText(/Couldn't reach the sign-in provider/i)
    ).toBeInTheDocument();
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
    // Restored in `finally`: without it, a failing assertion leaves the patched
    // location in place for every test that runs after this one.
    try {
      signInMock.mockResolvedValue({
        error: undefined,
        ok: true,
        url: "/apartments",
      });
      const user = userEvent.setup();
      render(<LoginForm providers={["credentials"]} />);

      await user.type(screen.getByLabelText(/Password/i), "correct");
      await user.click(screen.getByRole("button", { name: /Continue/i }));

      await waitFor(() => {
        expect(assignSpy).toHaveBeenCalledWith("/apartments");
      });
      expect(screen.queryByText("Wrong password")).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      });
    }
  });
});

// The privacy disclosure that E4 parked on this card moved to the landing
// page in E7 (#189), which is where the spec always wanted it. Its assertions
// live in src/app/__tests__/landing.test.tsx — verbatim claim, the named
// third parties, the never-stored/never-logged wording, and the
// no-unqualified-"zero-knowledge" rule. Deliberately not duplicated here: two
// copies of a copy rule drift, and the sign-in card no longer renders any of
// that text.

// The under-development gate (#239). The landing page stays up when
// FLATPARE_PUBLIC_ACCESS=closed; only this card changes.
describe("LoginForm — under-development notice", () => {
  it("shows nothing extra by default, so a self-hoster never sees a holding notice", () => {
    render(<LoginForm providers={["credentials"]} />);
    expect(screen.queryByText(/private beta/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("when closed, says so honestly and keeps the sign-in buttons for existing accounts", () => {
    render(<LoginForm providers={["google"]} access="closed" />);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/private beta/i);
    expect(text).toMatch(/new sign-ups are closed/i);
    // Roughly when, and a way to ask — no countdown, no invented numbers.
    expect(text).toMatch(/later this year/i);
    expect(screen.getByRole("link", { name: /ask for an invite/i })).toHaveAttribute(
      "href",
      expect.stringMatching(/^https:\/\/github\.com\//)
    );
    expect(text).not.toMatch(/\d+\s+people/i);
    expect(text).not.toMatch(/waitlist/i);
    expect(screen.getByRole("button", { name: /Continue with Google/i })).toBeInTheDocument();
  });

  it("explains a refused sign-up rather than showing a generic error", () => {
    render(<LoginForm providers={["google"]} access="closed" notice="sign-up-refused" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/sign-ups are closed for now/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/no account for that address/i);
  });

  it("explains a dead beta link", () => {
    render(<LoginForm providers={["google"]} access="closed" notice="beta-invalid" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/no longer valid/i);
  });

  it("swaps the holding notice for a welcome once a beta link was accepted", () => {
    render(<LoginForm providers={["google"]} access="closed" notice="beta-ready" />);
    expect(screen.getByRole("status")).toHaveTextContent(/beta invitation is ready/i);
    expect(screen.queryByText(/new sign-ups are closed/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue with Google/i })).toBeInTheDocument();
  });
});
