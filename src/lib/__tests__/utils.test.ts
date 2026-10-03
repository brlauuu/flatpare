import { describe, it, expect } from "vitest";
import { cn } from "../utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("foo", false && "bar", "baz")).toBe("foo baz");
  });

  it("resolves tailwind conflicts (last wins)", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
  });

  it("returns empty string for no inputs", () => {
    expect(cn()).toBe("");
  });

  it("handles undefined and null", () => {
    expect(cn("foo", undefined, null, "bar")).toBe("foo bar");
  });
});

// #324 final review: the theme's own utilities must merge like Tailwind's,
// or an override only works by luck of CSS emit order.
describe("cn with the theme's utilities", () => {
  it("lets a later shadow replace a theme shadow", () => {
    expect(cn("shadow-frame", "shadow-none")).toBe("shadow-none");
    expect(cn("shadow-button", "shadow-pressed")).toBe("shadow-pressed");
  });

  it("treats title-page / title-section as setting size, weight and tracking", () => {
    expect(cn("text-sm font-semibold tracking-tight", "title-page")).toBe("title-page");
    expect(cn("title-section", "text-sm")).toBe("text-sm");
  });
});
