import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { LOCALES } from "../locales";
import { NAMESPACES } from "../messages";

// The four translations stay in step with English (#288). A key that
// exists in one language and not another, or a translation that drops a
// placeholder, fails here instead of showing a user a raw key or "{count}".

const dir = path.join(process.cwd(), "messages");
type Tree = { [key: string]: string | Tree };

function read(locale: string, ns: string): Tree {
  return JSON.parse(fs.readFileSync(path.join(dir, locale, `${ns}.json`), "utf8"));
}

function leaves(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const at = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(at, value);
    else for (const [k, v] of leaves(value, at)) out.set(k, v);
  }
  return out;
}

// The arguments a message takes, and the rich-text tags it wraps, as a
// sorted signature. Plural and select branches are walked, so a translation
// can phrase a plural differently but must take the same arguments.
function signature(message: string): string[] {
  const found = new Set<string>();
  const walk = (elements: MessageFormatElement[]) => {
    for (const el of elements) {
      if (el.type === TYPE.argument || el.type === TYPE.number || el.type === TYPE.date || el.type === TYPE.time) {
        found.add(`{${el.value}}`);
      } else if (el.type === TYPE.plural || el.type === TYPE.select) {
        found.add(`{${el.value}}`);
        for (const option of Object.values(el.options)) walk(option.value);
      } else if (el.type === TYPE.tag) {
        found.add(`<${el.value}>`);
        walk(el.children);
      }
    }
  };
  walk(parse(message));
  return [...found].sort();
}

describe("message catalogues", () => {
  it("has a file for every namespace in every locale", () => {
    for (const locale of LOCALES) {
      for (const ns of NAMESPACES) {
        expect(fs.existsSync(path.join(dir, locale, `${ns}.json`)), `${locale}/${ns}.json`).toBe(true);
      }
    }
  });

  it("has no namespace file the loader does not know about", () => {
    for (const locale of LOCALES) {
      const files = fs.readdirSync(path.join(dir, locale)).filter((f) => f.endsWith(".json"));
      expect(files.map((f) => f.replace(/\.json$/, "")).sort()).toEqual([...NAMESPACES].sort());
    }
  });

  describe.each(NAMESPACES)("%s", (ns) => {
    const english = leaves(read("en", ns));

    it("parses as ICU in every locale", () => {
      for (const locale of LOCALES) {
        for (const [key, message] of leaves(read(locale, ns))) {
          expect(() => parse(message), `${locale}: ${ns}.${key}`).not.toThrow();
        }
      }
    });

    it.each(LOCALES.filter((l) => l !== "en"))("%s has exactly the English keys", (locale) => {
      expect([...leaves(read(locale, ns)).keys()].sort()).toEqual([...english.keys()].sort());
    });

    it.each(LOCALES.filter((l) => l !== "en"))("%s takes the same arguments as English", (locale) => {
      for (const [key, message] of leaves(read(locale, ns))) {
        const source = english.get(key);
        if (source === undefined) continue;
        expect(signature(message), `${locale}: ${ns}.${key}`).toEqual(signature(source));
      }
    });

    // Swiss German is written without ß (#288).
    it("de is written without ß", () => {
      for (const [key, message] of leaves(read("de", ns))) {
        expect(message, `de: ${ns}.${key}`).not.toContain("ß");
      }
    });

    it.each(LOCALES.filter((l) => l !== "en"))("%s leaves no message empty", (locale) => {
      for (const [key, message] of leaves(read(locale, ns))) {
        expect(message.trim(), `${locale}: ${ns}.${key}`).not.toBe("");
      }
    });
  });
});
