import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Landing } from "../_components/landing";
import { PRIVACY_CLAIM } from "@/lib/site";
import { LOCALES, type Locale } from "@/locales/locales";
import { setTestLocale } from "@/i18n/__tests__/test-locale";
import type { PublicAccess } from "@/lib/public-access";

// The landing page's copy rules, in every language (#288). landing.test.tsx
// holds them in English; these hold them in all five, so a translation
// cannot quietly make a claim the English deliberately avoids, or drop one
// it deliberately makes.

vi.mock("../_components/landing-fonts", () => ({ landingFontVariables: "" }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light", setTheme: () => {} }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

afterEach(cleanup);

type Tree = { [key: string]: string | Tree };
const catalogue = (locale: Locale): Tree =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", locale, "landing.json"), "utf8"));
const at = (tree: Tree, key: string) => key.split(".").reduce<Tree | string>((node, k) => (node as Tree)[k], tree) as string;
// A rich message as the reader sees it: tags gone, their words kept.
const plain = (message: string) => message.replace(/<\/?[a-z]+>/g, "");
const squash = (text: string) => text.replace(/\s+/g, " ").trim();

function pageText(locale: Locale, access: PublicAccess = "closed") {
  setTestLocale(locale);
  render(<Landing signIn={<div />} access={access} now={new Date("2026-10-20T12:00:00Z")} />);
  return squash(document.body.textContent ?? "");
}

// "Zero-knowledge" and its equivalents. Allowed only inside the sentence
// that disavows it.
const ZERO_KNOWLEDGE = /zero[\s-]?knowledge|null[\s-]?wissen|wissensfrei|connaissance nulle|divulgation nulle|conoscenza zero|conocimiento cero/i;

// "Open source" and its equivalents. The licence is O'SAASY, source-available.
const OPEN_SOURCE: Record<Locale, RegExp> = {
  en: /open[\s-]?source|free software/i,
  de: /open[\s-]?source|quelloffen|freie software/i,
  fr: /open[\s-]?source|code source ouvert|logiciel libre/i,
  it: /open[\s-]?source|codice aperto|software libero/i,
  es: /open[\s-]?source|código abierto|software libre/i,
};

// Sentences a translation must not drop: what the product promises, what it
// costs and what it does not do.
const DISCLOSURES = [
  "privacy.claim",
  "privacy.encryptedBody",
  "privacy.exceptionIntro",
  "privacy.exceptionPdf",
  "privacy.exceptionAddress",
  "privacy.exceptionListing",
  "privacy.tiles",
  "privacy.disavowal",
  "paths.hosted.thenOnce",
  "paths.hosted.betaKeep",
  "paths.hosted.limits",
  "paths.hosted.more",
  "paths.hosted.quota",
  "paths.hosted.noReset",
  "paths.selfHost.licence",
];

describe.each(LOCALES)("the landing page in %s", (locale) => {
  const messages = catalogue(locale);

  it("states the privacy claim", () => {
    expect(pageText(locale)).toContain(squash(at(messages, "privacy.claim")));
  });

  it("makes every disclosure", () => {
    const text = pageText(locale);
    for (const key of DISCLOSURES) {
      expect(text, key).toContain(squash(plain(at(messages, key))));
    }
  });

  it("names 'zero-knowledge' only to disavow it", () => {
    const disavowal = squash(at(messages, "privacy.disavowal"));
    const text = pageText(locale);
    expect(text).toContain(disavowal);
    expect(text.replace(disavowal, "")).not.toMatch(ZERO_KNOWLEDGE);
  });

  it("never calls the project open source, and names its licence", () => {
    const text = pageText(locale);
    expect(text).not.toMatch(OPEN_SOURCE[locale]);
    expect(text).toContain("O'SAASY");
  });

  it("quotes one price, CHF 5, and no other currency", () => {
    for (const access of ["closed", "open"] as const) {
      const text = pageText(locale, access);
      const prices = text.match(/CHF\s*[\d'’.,]+/g) ?? [];
      expect(prices.length, access).toBeGreaterThan(0);
      expect(new Set(prices.map((p) => p.replace(/[.,]$/, ""))), access).toEqual(new Set(["CHF 5"]));
      expect(text, access).not.toMatch(/[$€£]\s?\d|\d\s?(€|EUR|USD|Fr\.)/);
      cleanup();
    }
  });

  it("strikes the price through while the beta is free, and not after", () => {
    pageText(locale, "closed");
    expect(document.getElementById("hosted")!.querySelector("s")).toHaveTextContent("CHF 5");
    cleanup();
    pageText(locale, "open");
    expect(document.getElementById("hosted")!.querySelector("s")).toBeNull();
  });

  // English that a translation left in place.
  it.skipIf(locale === "en")("leaves no English sentence untranslated", () => {
    const english = catalogue("en");
    const text = pageText(locale);
    const leaves = (tree: Tree, prefix = ""): [string, string][] =>
      Object.entries(tree).flatMap(([k, v]) =>
        typeof v === "string" ? [[`${prefix}${k}`, v] as [string, string]] : leaves(v, `${prefix}${k}.`)
      );
    for (const [key, source] of leaves(english)) {
      const sentence = squash(plain(source));
      // Short labels and brand-only strings can match by design ("Flatpare").
      if (sentence.length < 24 || at(messages, key) === source) continue;
      expect(text, `${locale}: ${key} is still English`).not.toContain(sentence);
    }
  });
});

describe("the English privacy claim", () => {
  it("is the spec's sentence, verbatim", () => {
    expect(at(catalogue("en"), "privacy.claim")).toBe(PRIVACY_CLAIM);
  });
});
