import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { DecidedSketch, HeroSketch, InsideSketch } from "../hero-sketch";

afterEach(cleanup);

const SKETCHES = [
  ["HeroSketch", HeroSketch],
  ["InsideSketch", InsideSketch],
  ["DecidedSketch", DecidedSketch],
] as const;

function svgsOf(Sketch: () => React.ReactElement) {
  const { container } = render(<Sketch />);
  return [...container.querySelectorAll("svg")];
}
const textOf = (Sketch: () => React.ReactElement) => svgsOf(Sketch).map((s) => s.textContent).join(" ");

describe.each(SKETCHES)("%s", (_name, Sketch) => {
  it("is decoration: hidden from assistive technology and the pointer", () => {
    for (const svg of svgsOf(Sketch)) {
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("focusable", "false");
      expect(svg).toHaveClass("pointer-events-none");
    }
  });

  // Below 1280px the hero reflows and a fixed drawing lands on the text.
  it("shows from xl up only", () => {
    for (const svg of svgsOf(Sketch)) expect(svg).toHaveClass("hidden", "xl:block");
  });

  // Drawn one unit to one pixel and centred, so the marks keep their place
  // beside the content at every width instead of scaling off-screen (#326).
  it("is drawn at a fixed 1920-unit width, centred on the page", () => {
    for (const svg of svgsOf(Sketch)) {
      expect(svg.getAttribute("viewBox")).toMatch(/^-320 \d+ 1920 \d+$/);
      expect(svg).toHaveClass("w-[1920px]", "left-1/2", "-translate-x-1/2");
    }
  });

  // The SVG text is page text, and the landing page quotes exactly one
  // price (landing.test.tsx). A mock rent here would contradict it.
  it("quotes no price", () => {
    expect(textOf(Sketch)).not.toMatch(/CHF|\$|€/);
  });
});

describe("HeroSketch", () => {
  it("marks mock flats around the city (#326)", () => {
    const text = textOf(HeroSketch);
    expect(text).toContain("Flat A · big kitchen");
    expect(text).toContain("Flat C · too far?");
    expect(text).toContain("work · 20 min");
  });

  // Every note inside the band its svg draws (#326, #288): a note outside
  // it is cut off, as "too dark?" and "our favourite" once were.
  it("keeps every note inside its band", () => {
    const svgs = svgsOf(HeroSketch);
    expect(svgs.length).toBe(3);
    let notes = 0;
    for (const svg of svgs) {
      const [, minY, , height] = svg.getAttribute("viewBox")!.split(" ").map(Number);
      for (const note of svg.querySelectorAll("text")) {
        notes++;
        const y = Number(note.getAttribute("y"));
        const size = Number(note.getAttribute("font-size") ?? 26);
        expect(y - size, note.textContent ?? "").toBeGreaterThanOrEqual(minY);
        expect(y, note.textContent ?? "").toBeLessThanOrEqual(minY + height);
      }
    }
    expect(notes).toBeGreaterThan(0);
  });

  // A translated headline that wraps makes the hero taller (#288); the
  // marks belong to the top and bottom edges, not to the middle.
  it("pins its marks to the hero's top and bottom edges", () => {
    const [map, top, bottom] = svgsOf(HeroSketch);
    expect(map).toHaveAttribute("preserveAspectRatio", "xMidYMid slice");
    expect(map.querySelectorAll("text")).toHaveLength(0);
    expect(top).toHaveAttribute("preserveAspectRatio", "xMidYMin slice");
    expect(top).toHaveClass("top-0");
    expect(bottom).toHaveAttribute("preserveAspectRatio", "xMidYMax slice");
    expect(bottom).toHaveClass("bottom-0");
  });
});

describe("InsideSketch and DecidedSketch", () => {
  it("carry the hunt on to a decision", () => {
    expect(textOf(InsideSketch)).toContain("Flat B · both love it!");
    expect(textOf(DecidedSketch)).toContain("decided: Flat B");
  });
});
