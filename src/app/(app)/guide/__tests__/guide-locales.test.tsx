import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import GuidePage from "../page";
import { LOCALES, type Locale } from "@/i18n/locales";
import { setTestLocale } from "@/i18n/__tests__/test-locale";

// The guide in five languages (#288). Each one has the English guide's
// shape, and the same rules as the landing page hold in it: one price, no
// "zero-knowledge" claim, never "open source".

afterEach(cleanup);

const source = (locale: Locale) =>
  fs.readFileSync(path.join(process.cwd(), "src", "content", `guide.${locale}.md`), "utf8");

// The outline: how many headings at each level, list items and table rows.
function outline(markdown: string) {
  const lines = markdown.split("\n");
  const count = (re: RegExp) => lines.filter((l) => re.test(l)).length;
  return {
    h1: count(/^# /),
    h2: count(/^## /),
    h3: count(/^### /),
    listItems: count(/^\s*(?:[-*]|\d+\.) /),
    tableRows: count(/^\|/),
  };
}

const ZERO_KNOWLEDGE = /zero[\s-]?knowledge|null[\s-]?wissen|connaissance nulle|divulgation nulle|conoscenza zero|conocimiento cero/i;
const OPEN_SOURCE = /open[\s-]?source|quelloffen|freie software|code source ouvert|logiciel libre|codice aperto|software libero|código abierto|software libre/i;

describe("the guide page", () => {
  it.each(LOCALES)("renders the %s guide in that language", async (locale) => {
    setTestLocale(locale);
    const { container } = render(await GuidePage());
    const firstHeading = source(locale).split("\n").find((l) => l.startsWith("# "))!.slice(2);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(firstHeading);
    expect(container.querySelector("article")).toHaveAttribute("lang", locale);
  });
});

describe.each(LOCALES)("guide.%s.md", (locale) => {
  const text = source(locale);

  it("has the English guide's outline", () => {
    expect(outline(text)).toEqual(outline(source("en")));
  });

  it("quotes one price, CHF 5", () => {
    const prices = text.match(/CHF\s*[\d'’.,]+/g) ?? [];
    expect(prices.length).toBeGreaterThan(0);
    expect(new Set(prices.map((p) => p.replace(/[.,]$/, "")))).toEqual(new Set(["CHF 5"]));
    expect(text).not.toMatch(/[$€£]\s?\d|\d\s?(€|EUR|USD)/);
  });

  it("claims neither zero-knowledge nor open source", () => {
    expect(text).not.toMatch(ZERO_KNOWLEDGE);
    expect(text).not.toMatch(OPEN_SOURCE);
  });

  // The hosted service signs in with Google or an email link (#323).
  it("does not offer GitHub sign-in", () => {
    expect(text).not.toMatch(/GitHub/);
  });

  it.skipIf(locale !== "de")("is written without ß", () => {
    expect(text).not.toContain("ß");
  });

  it.skipIf(locale === "en")("leaves no English paragraph untranslated", () => {
    const translated = new Set(text.split("\n").map((l) => l.trim()));
    for (const line of source("en").split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length < 40) continue;
      expect(translated.has(trimmed), `still English: ${trimmed.slice(0, 60)}`).toBe(false);
    }
  });
});

// Locations of interest moved to the Household page in #298; the guide said
// Settings until #288's translators noticed.
describe("where the guide sends you for locations of interest", () => {
  it("is the Household page", () => {
    expect(source("en")).toMatch(/On the \*\*Household\*\* page, save up to \*\*five\*\* places/);
  });
});

// While sign-ups are closed the hosted version is free, and the guide says so
// in the landing page's words (#288). Remove at 1.0.0, with the landing
// page's beta copy.
describe.each(LOCALES)("the %s guide's beta note", (locale) => {
  it("says the beta is free and that what it gives is kept", () => {
    const landing = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "messages", locale, "landing.json"), "utf8")
    ) as { paths: { hosted: { betaKeep: string } } };
    // The landing line after its first sentence ("Request access below."),
    // which does not apply inside the app.
    const kept = landing.paths.hosted.betaKeep.replace(/^[^.]+\.\s*/, "");
    expect(source(locale)).toContain(kept);
  });
});
