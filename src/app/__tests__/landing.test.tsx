import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Landing } from "../_components/landing";
import { PRIVACY_CLAIM, RELEASES_URL, REPO_URL } from "@/lib/site";
import type { PublicAccess } from "@/lib/public-access";
import type { ReleaseInfo } from "@/lib/release";

// next/font only works under the Next compiler.
vi.mock("../_components/landing-fonts", () => ({ landingFontVariables: "" }));

const theme = vi.hoisted(() => ({ resolvedTheme: "light", setTheme: () => {} }));
// The language menu re-renders the page on a choice (#288).
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("next-themes", () => ({ useTheme: () => theme }));

beforeEach(() => {
  theme.resolvedTheme = "light";
  theme.setTheme = vi.fn();
  window.localStorage.clear();
});
afterEach(cleanup);

const NOW = new Date("2026-10-03T12:00:00Z");

function renderLanding(
  opts: { access?: PublicAccess; openSignIn?: boolean; release?: ReleaseInfo | null } = {}
) {
  return render(
    <Landing
      signIn={<div data-testid="signin-card" />}
      access={opts.access ?? "closed"}
      openSignIn={opts.openSignIn}
      release={opts.release ?? null}
      now={NOW}
    />
  );
}

const pageText = () => document.body.textContent ?? "";

describe("Landing", () => {
  it("leads with the headline from the design", () => {
    renderLanding();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Compare flats.Decide together."
    );
  });

  it("names the three things it is, in one list", () => {
    renderLanding();
    const tags = within(screen.getByRole("list", { name: /why flatpare/i })).getAllByRole("listitem");
    expect(tags.map((t) => t.textContent)).toEqual(["Collaborative", "Privacy first*", "Data driven"]);
  });

  // The asterisk is a promise that the claim is qualified somewhere (#323).
  it("links 'Privacy first*' to the privacy section", () => {
    renderLanding();
    expect(screen.getByRole("link", { name: "Privacy first*" })).toHaveAttribute("href", "#privacy");
    expect(document.getElementById("privacy")).not.toBeNull();
  });

  // Design-file labels, not product copy (#323).
  it("carries no 'FIG.' labels from the design", () => {
    renderLanding();
    expect(pageText()).not.toMatch(/FIG\./);
  });

  // The real grid, one capture per theme (scripts/capture-hero.mjs).
  it("shows the comparison grid in the hero, one image per theme", () => {
    renderLanding();
    const shots = screen.getAllByRole("img", { name: /comparison grid/i });
    const sources = shots.map((img) => img.getAttribute("src") ?? "");
    expect(sources.some((src) => src.includes("compare-en-light"))).toBe(true);
    expect(sources.some((src) => src.includes("compare-en-dark"))).toBe(true);
    // One capture per language and theme (#288).
    for (const name of ["en", "de", "fr", "it", "es"].flatMap((l) => [`compare-${l}-light.webp`, `compare-${l}-dark.webp`])) {
      expect(fs.existsSync(path.join(process.cwd(), "public", "hero", name))).toBe(true);
    }
  });

  // The landing page shows the app in the reader's language (#288).
  it("shows the comparison grid in the reader's language", async () => {
    const { setTestLocale } = await import("@/i18n/__tests__/test-locale");
    setTestLocale("de");
    renderLanding();
    const sources = screen.getAllByRole("img", { name: /.+/ }).map((img) => img.getAttribute("src") ?? "");
    expect(sources.some((src) => src.includes("compare-de-light"))).toBe(true);
    expect(sources.some((src) => src.includes("compare-en-"))).toBe(false);
  });

  // A larger copy of the grid under the feature list (#323).
  it("shows the comparison grid again under the feature list", () => {
    renderLanding();
    const features = screen.getByRole("heading", { name: "What's inside" }).closest("section")!;
    const shots = within(features).getAllByRole("img", { name: /comparison grid/i });
    expect(shots).toHaveLength(2);
  });

  it("links the nav to the sections it names", () => {
    renderLanding();
    expect(screen.getByRole("link", { name: "How it works" })).toHaveAttribute("href", "#video");
    expect(screen.getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "#paths");
    expect(document.getElementById("video")).not.toBeNull();
    expect(document.getElementById("paths")).not.toBeNull();
    expect(document.getElementById("hosted")).not.toBeNull();
    expect(document.getElementById("self-host")).not.toBeNull();
  });

  it("shows a placeholder until the walkthrough video exists", () => {
    renderLanding();
    expect(pageText()).toMatch(/walkthrough video coming soon/i);
    expect(screen.queryByRole("link", { name: /youtube/i })).not.toBeInTheDocument();
  });

  it("credits the author in the footer", () => {
    renderLanding();
    expect(screen.getByRole("link", { name: "brlauuu" })).toHaveAttribute("href", "https://brlauuu.dev");
    expect(screen.getByRole("link", { name: "Changelog" })).toHaveAttribute("href", RELEASES_URL);
  });

  it("describes what the product does", () => {
    renderLanding();
    const text = pageText();
    expect(text).toMatch(/PDF/);
    expect(text).toMatch(/[Rr]ate/);
    expect(text).toMatch(/transit/);
  });

  // The spec (2026-09-01-accounts-e2ee-billing-design.md, "The privacy claim,
  // stated exactly") requires this sentence verbatim on the landing page.
  describe("the privacy claim", () => {
    it("states the spec's claim verbatim", () => {
      renderLanding();
      expect(screen.getByText(PRIVACY_CLAIM)).toBeInTheDocument();
    });

    it("is the exact sentence the spec fixes, not a paraphrase", () => {
      expect(PRIVACY_CLAIM).toBe(
        "We can't read your data. We do process PDFs and addresses in memory when you ask us to, and we never store them."
      );
    });

    // "Do not claim 'zero-knowledge' without that qualification."
    it("never uses 'zero-knowledge' as an unqualified claim", () => {
      renderLanding();
      const text = pageText();
      if (text.toLowerCase().includes("zero-knowledge")) {
        expect(text).toMatch(/private by design, but not zero-knowledge/i);
      }
      expect(text).not.toMatch(/\bis\s+zero-knowledge\b/i);
      expect(text).not.toMatch(/\btruly\s+zero-knowledge\b/i);
    });

    it("names the processing exception concretely, not in the abstract", () => {
      renderLanding();
      const privacy = document.getElementById("privacy")!;
      expect(privacy).toHaveTextContent(PRIVACY_CLAIM);
      expect(privacy).toHaveTextContent(/The exception, stated plainly/);
      expect(privacy).toHaveTextContent(/Google Maps/);
      expect(privacy).toHaveTextContent(/Gemini/);
      expect(privacy).toHaveTextContent(/only to check that the listing is still online/);
      expect(privacy).toHaveTextContent(/never written to our database/i);
      expect(privacy).toHaveTextContent(/never logged/i);
      expect(privacy).toHaveTextContent(/private by design, but not zero-knowledge/i);
    });

    // "Can and can't see": the metadata the server holds is named too
    // (docs/security-notes.md, "the server sees metadata").
    it("names the metadata the server does see", () => {
      renderLanding();
      const privacy = document.getElementById("privacy")!;
      expect(privacy).toHaveTextContent(/who is in your household/);
      expect(privacy).toHaveTextContent(/who rated what/);
      expect(privacy).toHaveTextContent(/size of each stored PDF/);
    });

    // True because the hosted deployment runs AI_PROVIDER=gateway (#333);
    // the gateway itself is not named (#405).
    it("says the hosted PDF reading has zero data retention, without naming the gateway", () => {
      renderLanding();
      const privacy = document.getElementById("privacy")!;
      expect(privacy).toHaveTextContent(/guarantee zero data retention/);
      expect(privacy).not.toHaveTextContent(/Vercel/);
    });

    it("says what each outside service sees, and no more (#405)", () => {
      renderLanding();
      const privacy = document.getElementById("privacy")!;
      expect(privacy).toHaveTextContent(/with nothing that names you or your household/);
      expect(privacy).toHaveTextContent(/Nothing is read from the page or kept/);
      expect(privacy).toHaveTextContent(/sees your IP address and which area of the map/);
      expect(privacy).toHaveTextContent(/not its address, any of its details, ratings or comments/);
    });

    // It applies to self-hosting too, so it lives in its own section (#323).
    it("keeps the exception out of the hosted pricing card", () => {
      renderLanding();
      const hosted = document.getElementById("hosted")!;
      expect(hosted).not.toHaveTextContent(/zero-knowledge/i);
      expect(hosted).not.toHaveTextContent(/never logged/i);
    });

    it("admits the data is unrecoverable rather than implying we can help", () => {
      renderLanding();
      const text = pageText();
      expect(text).toMatch(/recovery code/i);
      expect(text).toMatch(/there is no reset/i);
    });
  });

  describe("pricing", () => {
    it("says hosting is paid and self-hosting is free", () => {
      renderLanding();
      const hosted = document.getElementById("hosted")!;
      const selfHost = document.getElementById("self-host")!;
      expect(hosted).toHaveTextContent(/We run it for you/);
      expect(hosted).toHaveTextContent(/CHF 5/);
      expect(selfHost).toHaveTextContent(/Run it yourself/);
      expect(selfHost).toHaveTextContent(/Free/);
    });

    // One price. If two figures appear, the page contradicts itself, which on
    // a pricing page is worse than saying nothing.
    it("quotes one price, CHF 5, wherever a price appears", () => {
      renderLanding();
      const prices = pageText().match(/CHF\s*\d+/g) ?? [];
      expect(prices.length).toBeGreaterThan(0);
      expect(new Set(prices)).toEqual(new Set(["CHF 5"]));
    });

    // Stripe charges francs.
    it("does not quote a dollar price anywhere", () => {
      renderLanding();
      expect(pageText()).not.toMatch(/\$\s?\d/);
    });

    it("says plainly that it is a one-time payment, not a subscription", () => {
      renderLanding();
      expect(pageText()).toMatch(/not a subscription/i);
      expect(pageText()).toMatch(/one-time payment/i);
    });

    // The quota counts apartments ADDED, not held.
    it("discloses that deleting an apartment does not refund the credit", () => {
      renderLanding();
      const text = pageText();
      expect(text).toMatch(/counts apartments you\s*add/i);
      expect(text).toMatch(/does not give the\s*credit back/i);
    });

    it("explains that another CHF 5 adds another 40", () => {
      renderLanding();
      expect(pageText()).toMatch(/another CHF 5\s*adds another 40/i);
    });

    // Must match the MAX_MEMBERS / MAX_APARTMENTS the hosted deployment sets.
    it("states what the plan includes: 10 people and 40 apartments", () => {
      renderLanding();
      const text = pageText();
      expect(text).toMatch(/10 people/);
      expect(text).toMatch(/40 apartments/);
    });

    // While the hosted deployment is a closed beta the invite form sits right
    // under the price, which read as "request an invite, then pay" (#322).
    // The price is struck through and the beta named in its place (#323).
    it("strikes through the price and says the beta is free while sign-ups are closed", () => {
      renderLanding({ access: "closed" });
      const hosted = document.getElementById("hosted")!;
      const struck = hosted.querySelector("s");
      expect(struck).toHaveTextContent(/CHF 5/);
      expect(hosted).toHaveTextContent(/Free beta/);
      expect(hosted).toHaveTextContent(/neither your data nor your credits are taken back when the beta ends/i);
    });

    it("shows the price plainly once sign-ups are open", () => {
      renderLanding({ access: "open" });
      const hosted = document.getElementById("hosted")!;
      expect(hosted.querySelector("s")).toBeNull();
      expect(hosted).toHaveTextContent(/CHF 5/);
      expect(pageText()).not.toMatch(/free beta/i);
    });
  });

  describe("the licence", () => {
    it("describes the project as source available", () => {
      renderLanding();
      expect(pageText()).toMatch(/source available/i);
    });

    // O'SAASY forbids offering it as a competing hosted service, so "open
    // source" on a public page would be inaccurate.
    it("does not call the project open source", () => {
      renderLanding();
      expect(pageText().toLowerCase()).not.toContain("open source");
    });

    it("names the licence exactly as LICENSE does", () => {
      const licence = fs.readFileSync(path.join(process.cwd(), "LICENSE"), "utf8");
      expect(licence).toMatch(/^O'SAASY License/);
      renderLanding();
      expect(pageText()).toContain("O'SAASY");
    });

    it("points at the repository for the self-hosting path", () => {
      renderLanding();
      const selfHost = document.getElementById("self-host")!;
      expect(within(selfHost).getByRole("link", { name: /view on github/i })).toHaveAttribute(
        "href",
        REPO_URL
      );
      expect(selfHost).toHaveTextContent("docker compose up");
    });
  });

  // While sign-ups are closed the hosted path is the beta form; when open (a
  // self-hoster's default) there is nothing to request.
  describe("the hosted call to action", () => {
    it("while closed: a beta-invite form and a hero link to it", () => {
      renderLanding({ access: "closed" });
      expect(screen.getByRole("link", { name: "Request a beta invite" })).toHaveAttribute("href", "#hosted");
      expect(screen.getByLabelText("Request a beta invite")).toHaveAttribute("type", "email");
      expect(pageText()).toContain("PRIVATE BETA");
    });

    it("while open: no beta form, sign-up buttons instead", () => {
      renderLanding({ access: "open" });
      expect(screen.queryByLabelText("Request a beta invite")).not.toBeInTheDocument();
      expect(pageText()).not.toContain("PRIVATE BETA");
      expect(screen.getByRole("button", { name: "Get started" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /create your account/i })).toBeInTheDocument();
    });
  });

  // Existing users sign in here, and the sign-in flow reports back here.
  describe("the sign-in dialog", () => {
    it("is closed by default and opens from the nav", async () => {
      renderLanding();
      expect(screen.queryByTestId("signin-card")).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByTestId("signin-card")).toBeInTheDocument();
    });

    it("opens on load when the page has a notice to show", async () => {
      renderLanding({ openSignIn: true });
      expect(await screen.findByTestId("signin-card")).toBeInTheDocument();
    });

    it("closes with its close button", async () => {
      renderLanding({ openSignIn: true });
      await screen.findByRole("dialog");
      await userEvent.click(screen.getByRole("button", { name: "Close" }));
      await vi.waitFor(() => expect(screen.queryByTestId("signin-card")).not.toBeInTheDocument());
    });

    it("opens from the open-access sign-up buttons too", async () => {
      renderLanding({ access: "open" });
      await userEvent.click(screen.getByRole("button", { name: /create your account/i }));
      expect(await screen.findByTestId("signin-card")).toBeInTheDocument();
    });
  });

  describe("the release notice", () => {
    const fresh = { version: "0.4.0", date: "2026-10-02" };

    it("mentions a recent release and links to what changed", async () => {
      renderLanding({ release: fresh });
      const notice = await screen.findByRole("status");
      expect(notice).toHaveTextContent("New release");
      expect(notice).toHaveTextContent("v0.4.0");
      expect(within(notice).getByRole("link", { name: /what's changed/i })).toHaveAttribute(
        "href",
        RELEASES_URL
      );
    });

    it("says nothing about a release older than 30 days", () => {
      renderLanding({ release: { version: "0.1.0", date: "2026-08-01" } });
      expect(screen.queryByText("New release")).not.toBeInTheDocument();
    });

    it("says nothing when there is no release", () => {
      renderLanding({ release: null });
      expect(screen.queryByText("New release")).not.toBeInTheDocument();
    });

    it("stays dismissed for that version, and comes back for the next", async () => {
      renderLanding({ release: fresh });
      await userEvent.click(await screen.findByRole("button", { name: /dismiss release notice/i }));
      expect(screen.queryByText("New release")).not.toBeInTheDocument();

      cleanup();
      renderLanding({ release: fresh });
      expect(screen.queryByText("New release")).not.toBeInTheDocument();

      cleanup();
      renderLanding({ release: { version: "0.5.0", date: "2026-10-03" } });
      expect(await screen.findByText("New release")).toBeInTheDocument();
    });

    it("still works when browser storage is unavailable", async () => {
      const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("SecurityError");
      });
      const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("SecurityError");
      });
      renderLanding({ release: fresh });
      await userEvent.click(await screen.findByRole("button", { name: /dismiss release notice/i }));
      expect(screen.queryByText("New release")).not.toBeInTheDocument();
      get.mockRestore();
      set.mockRestore();
    });
  });

  describe("the theme toggle", () => {
    it("switches a light page to dark", async () => {
      renderLanding();
      await userEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
      expect(theme.setTheme).toHaveBeenCalledWith("dark");
    });

    it("switches a dark page to light", async () => {
      theme.resolvedTheme = "dark";
      renderLanding();
      await userEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
      expect(theme.setTheme).toHaveBeenCalledWith("light");
    });
  });
});
