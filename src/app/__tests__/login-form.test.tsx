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

  it("when closed, offers one line to ask for access and keeps the sign-in buttons", () => {
    render(<LoginForm providers={["google"]} access="closed" />);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/new here\? flatpare is in a private beta/i);
    // No stacked notices before anyone has tried anything.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(text).not.toMatch(/\d+\s+people/i);
    expect(text).not.toMatch(/waitlist/i);
    expect(screen.getByRole("button", { name: /Continue with Google/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request access" })).toBeInTheDocument();
  });

  it("switches to the request view and back without leaving the card", async () => {
    const user = userEvent.setup();
    render(<LoginForm providers={["google"]} access="closed" />);
    await user.click(screen.getByRole("button", { name: "Request access" }));
    expect(screen.getByRole("heading", { name: /request access to the beta/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Continue with Google/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /back to sign in/i }));
    expect(screen.getByRole("button", { name: /Continue with Google/i })).toBeInTheDocument();
  });

  it("lands a refused sign-up on the request view, saying it once", () => {
    render(<LoginForm providers={["google"]} access="closed" notice="sign-up-refused" />);
    expect(screen.getByRole("heading", { name: /no account for this address yet/i })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/sign-ups are closed/i)).not.toBeInTheDocument();
    // With Google the app never learns the address, so it starts empty.
    expect(screen.getByLabelText("Email")).toHaveValue("");
  });

  it("fills in the address a refused magic link was for, and forgets it after", () => {
    window.sessionStorage.setItem("flatpare.refusedEmail", "ana@example.com");
    render(<LoginForm providers={["resend"]} access="closed" notice="sign-up-refused" />);
    expect(screen.getByLabelText("Email")).toHaveValue("ana@example.com");
    expect(window.sessionStorage.getItem("flatpare.refusedEmail")).toBeNull();
  });

  it("ignores a stale refusal in the URL once access is open again", () => {
    render(<LoginForm providers={["google"]} access="open" notice="sign-up-refused" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/private beta/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue with Google/i })).toBeInTheDocument();
  });

  it("explains a dead beta link", () => {
    render(<LoginForm providers={["google"]} access="closed" notice="beta-invalid" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/no longer valid/i);
  });

  it("swaps the holding notice for a welcome once a beta link was accepted", () => {
    render(<LoginForm providers={["google"]} access="closed" notice="beta-ready" />);
    expect(screen.getByRole("status")).toHaveTextContent(/beta invitation is ready/i);
    // Decided on #240: beta access is permanent, and that is said up front.
    expect(screen.getByRole("status")).toHaveTextContent(/yours to keep/i);
    expect(screen.getByRole("status")).toHaveTextContent(/neither your data nor your credits are taken back/i);
    expect(screen.queryByText(/new here\?/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue with Google/i })).toBeInTheDocument();
  });
});

describe("LoginForm — magic link (#310)", () => {
  async function requestLink(address = "ana@example.com") {
    const user = userEvent.setup();
    render(<LoginForm providers={["resend"]} />);
    await user.type(screen.getByLabelText(/Email/i), address);
    await user.click(screen.getByRole("button", { name: /Email me a sign-in link/i }));
  }

  it("renders the email form when resend is enabled, and not otherwise", () => {
    render(<LoginForm providers={["resend"]} />);
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Password/i)).not.toBeInTheDocument();
    cleanup();
    render(<LoginForm providers={["google"]} />);
    expect(screen.queryByLabelText(/Email/i)).not.toBeInTheDocument();
  });

  it("asks Auth.js for a link without leaving the page, then says to check the inbox", async () => {
    signInMock.mockResolvedValue({ ok: true, url: "http://localhost/api/auth/verify-request" });
    await requestLink();
    expect(signInMock).toHaveBeenCalledWith("resend", {
      email: "ana@example.com",
      redirect: false,
      callbackUrl: "/apartments",
    });
    const note = await screen.findByRole("status");
    expect(note).toHaveTextContent(/check your email/i);
    expect(note).toHaveTextContent("ana@example.com");
    expect(screen.queryByLabelText(/Email/i)).not.toBeInTheDocument();
  });

  it("follows the refusal when sign-ups are closed, so the landing page can explain", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    signInMock.mockResolvedValue({ ok: true, url: "http://localhost/?signin=closed" });
    await requestLink();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("http://localhost/?signin=closed"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    // Carried across the page load for the request form, never in the URL.
    expect(window.sessionStorage.getItem("flatpare.refusedEmail")).toBe("ana@example.com");
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("shows an error when the link could not be sent", async () => {
    signInMock.mockResolvedValue({ ok: false, error: "EmailSignin" });
    await requestLink();
    expect(await screen.findByText(/Couldn't send the sign-in link/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
  });

  it("explains an expired link and a generic failure", () => {
    render(<LoginForm providers={["resend"]} notice="link-expired" />);
    expect(screen.getByRole("status")).toHaveTextContent(/expired or was already used/i);
    cleanup();
    render(<LoginForm providers={["resend"]} notice="sign-in-failed" />);
    expect(screen.getByRole("status")).toHaveTextContent(/did not go through/i);
  });
});

// The landing page's blue/yellow wordmark, not an inverted black one (#323).
describe("LoginForm — logo", () => {
  it("shows one logo per theme", () => {
    render(<LoginForm providers={["google"]} />);
    const sources = screen.getAllByRole("img", { name: "Flatpare" }).map((img) => img.getAttribute("src") ?? "");
    expect(sources).toHaveLength(2);
    expect(sources.some((src) => src.includes("flatpare_logo_blue.svg"))).toBe(true);
    expect(sources.some((src) => src.includes("flatpare_logo_yellow.svg"))).toBe(true);
  });
});
