import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Landing } from "../_components/landing";
import { PRIVACY_CLAIM, REPO_URL } from "@/lib/site";

afterEach(cleanup);

function renderLanding() {
  return render(<Landing signIn={<div data-testid="signin-card" />} />);
}

const pageText = () => document.body.textContent ?? "";

describe("Landing", () => {
  it("renders the sign-in card it is given", () => {
    renderLanding();
    expect(screen.getByTestId("signin-card")).toBeInTheDocument();
  });

  // The spec (2026-09-01-accounts-e2ee-billing-design.md, "The privacy claim,
  // stated exactly") requires this sentence verbatim on the landing page.
  // Asserted against the exported constant so the page and the spec cannot
  // drift into two different wordings.
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

    // "Do not claim 'zero-knowledge' without that qualification." The blind
    // proxy is a real exception, so an unqualified claim would be false.
    it("never uses 'zero-knowledge' as an unqualified claim", () => {
      renderLanding();
      const text = pageText();
      const mentions = text.toLowerCase().includes("zero-knowledge");
      if (mentions) {
        // The only permitted use is the explicit disavowal.
        expect(text).toMatch(/do not describe this as zero-knowledge/i);
      }
      expect(text).not.toMatch(/\bis\s+zero-knowledge\b/i);
      expect(text).not.toMatch(/\btruly\s+zero-knowledge\b/i);
    });

    it("names the processing exception concretely, not in the abstract", () => {
      renderLanding();
      const text = pageText();
      expect(text).toMatch(/Google Maps/);
      expect(text).toMatch(/Gemini/);
      expect(text).toMatch(/never written to our database/i);
      expect(text).toMatch(/never logged/i);
    });

    it("admits the data is unrecoverable rather than implying we can help", () => {
      renderLanding();
      const text = pageText();
      expect(text).toMatch(/recovery code/i);
      expect(text).toMatch(/there is no reset/i);
    });
  });

  describe("hosting", () => {
    it("says hosting is paid and self-hosting is free", () => {
      renderLanding();
      const text = pageText();
      expect(text).toMatch(/Hosted by us/);
      expect(text).toMatch(/Run it yourself — free/);
    });

    // One plan, one price, stated in both the hero and the hosting section.
    // If these drift apart the page contradicts itself, which on a pricing
    // page is worse than saying nothing.
    it("quotes $5 a month in the hero and the hosting section", () => {
      renderLanding();
      const matches = pageText().match(/\$5 a month/g) ?? [];
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    // These are the numbers a paying customer is buying. They must match the
    // MAX_MEMBERS / MAX_APARTMENTS the hosted deployment actually sets.
    it("states what the plan includes: 10 people and 40 apartments", () => {
      renderLanding();
      const text = pageText();
      expect(text).toMatch(/10 people/);
      expect(text).toMatch(/40 apartments/);
    });

    it("describes the project as source available", () => {
      renderLanding();
      expect(pageText()).toMatch(/source available/i);
    });

    // The licence is O'SAASY: source-available, with a clause forbidding
    // offering it to third parties as a competing hosted service. Calling it
    // "open source" on a public page would be inaccurate.
    it("does not call the project open source", () => {
      renderLanding();
      expect(pageText().toLowerCase()).not.toContain("open source");
    });

    it("points at the repository for the self-hosting path", () => {
      renderLanding();
      const links = screen.getAllByRole("link", { name: /source|setup guide/i });
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        expect(link).toHaveAttribute("href", REPO_URL);
      }
    });
  });

  it("describes what the product does", () => {
    renderLanding();
    const text = pageText();
    expect(text).toMatch(/PDF/);
    expect(text).toMatch(/[Rr]ate/);
    expect(text).toMatch(/transit/);
  });
});
