import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import TermsPage from "../page";
import { fillOperator, readOperator } from "@/lib/operator";
import { LOCALES, type Locale } from "@/locales/locales";
import { setTestLocale } from "@/i18n/__tests__/test-locale";

// The terms page (#474): the operator comes from configuration, the text
// from src/content/terms.<locale>.md, and English is binding.

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/language-menu", () => ({ LanguageMenu: () => null }));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const OPERATOR = { name: "Ana Muster", city: "Zürich", email: "hello@example.com" };

function stubOperator() {
  vi.stubEnv("FLATPARE_OPERATOR_NAME", OPERATOR.name);
  vi.stubEnv("FLATPARE_OPERATOR_CITY", OPERATOR.city);
  vi.stubEnv("FLATPARE_CONTACT_EMAIL", OPERATOR.email);
}

const source = (locale: Locale) =>
  fs.readFileSync(path.join(process.cwd(), "src", "content", `terms.${locale}.md`), "utf8");

function outline(markdown: string) {
  const lines = markdown.split("\n");
  const count = (re: RegExp) => lines.filter((l) => re.test(l)).length;
  return { h1: count(/^# /), h2: count(/^## /), listItems: count(/^\s*- /) };
}

describe("readOperator", () => {
  it("needs all three values, trimmed", () => {
    expect(readOperator({ FLATPARE_OPERATOR_NAME: " A ", FLATPARE_OPERATOR_CITY: "B", FLATPARE_CONTACT_EMAIL: "c@d.e" }))
      .toEqual({ name: "A", city: "B", email: "c@d.e" });
    expect(readOperator({ FLATPARE_OPERATOR_NAME: "A", FLATPARE_OPERATOR_CITY: "B" })).toBeNull();
    expect(readOperator({ FLATPARE_OPERATOR_NAME: " ", FLATPARE_OPERATOR_CITY: "B", FLATPARE_CONTACT_EMAIL: "c@d.e" })).toBeNull();
  });
});

describe("fillOperator", () => {
  it("takes Markdown and HTML in a configured value literally", () => {
    const filled = fillOperator("{operatorName} [{contactEmail}](mailto:{contactEmail})", {
      name: "<b>[x](y)</b>",
      city: "c",
      email: "a@b.c",
    });
    expect(filled).toBe("\\<b\\>\\[x\\]\\(y\\)\\</b\\> [a@b.c](mailto:a@b.c)");
  });
});

describe("the terms page", () => {
  it("does not exist without an operator, as on a self-hosted copy", async () => {
    await expect(TermsPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it.each(LOCALES)("renders the %s text with the operator filled in", async (locale) => {
    stubOperator();
    setTestLocale(locale);
    const { container } = render(await TermsPage());
    const article = container.querySelector("article")!;
    expect(article).toHaveAttribute("lang", locale);
    expect(article.textContent).toContain(`${OPERATOR.name}, ${OPERATOR.city}`);
    expect(article.textContent).not.toMatch(/\{(operatorName|operatorCity|contactEmail)\}/);
    expect(screen.getByRole("link", { name: OPERATOR.email })).toHaveAttribute("href", `mailto:${OPERATOR.email}`);
  });
});

const ZERO_KNOWLEDGE = /zero[\s-]?knowledge|null[\s-]?wissen|connaissance nulle|conoscenza zero|conocimiento cero/i;
const OPEN_SOURCE = /open[\s-]?source|quelloffen|freie software|logiciel libre|codice aperto|software libero|código abierto|software libre/i;

describe.each(LOCALES)("terms.%s.md", (locale) => {
  const text = source(locale);

  it("has the English text's outline and names the operator in each place", () => {
    expect(outline(text)).toEqual(outline(source("en")));
    for (const placeholder of ["{operatorName}", "{operatorCity}", "[{contactEmail}](mailto:{contactEmail})"]) {
      expect(text).toContain(placeholder);
    }
  });

  it("quotes one price, CHF 5, and the 14-day refund", () => {
    const prices = text.match(/CHF\s*[\d'’.,]+/g) ?? [];
    expect(new Set(prices.map((p) => p.replace(/[.,]$/, "")))).toEqual(new Set(["CHF 5"]));
    expect(text).toMatch(/\b14\b/);
  });

  it("claims neither zero-knowledge nor open source, and German has no ß", () => {
    expect(text).not.toMatch(ZERO_KNOWLEDGE);
    expect(text).not.toMatch(OPEN_SOURCE);
    if (locale === "de") expect(text).not.toContain("ß");
  });
});
