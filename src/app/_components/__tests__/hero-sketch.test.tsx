import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { DecidedSketch, HeroSketch, InsideSketch } from "../hero-sketch";

afterEach(cleanup);

const SKETCHES = [
  ["HeroSketch", HeroSketch],
  ["InsideSketch", InsideSketch],
  ["DecidedSketch", DecidedSketch],
] as const;

function svgOf(Sketch: () => React.ReactElement) {
  const { container } = render(<Sketch />);
  return container.querySelector("svg")!;
}

describe.each(SKETCHES)("%s", (_name, Sketch) => {
  it("is decoration: hidden from assistive technology and the pointer", () => {
    const svg = svgOf(Sketch);
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg).toHaveClass("pointer-events-none");
  });

  // Below 1280px the hero reflows and a fixed drawing lands on the text.
  it("shows from xl up only", () => {
    const svg = svgOf(Sketch);
    expect(svg).toHaveClass("hidden", "xl:block");
  });

  // Drawn one unit to one pixel and centred, so the marks keep their place
  // beside the content at every width instead of scaling off-screen (#326).
  it("is drawn at a fixed 1920-unit width, centred on the page", () => {
    const svg = svgOf(Sketch);
    expect(svg.getAttribute("viewBox")).toMatch(/^-320 0 1920 \d+$/);
    expect(svg).toHaveClass("w-[1920px]", "left-1/2", "-translate-x-1/2");
  });

  // The SVG text is page text, and the landing page quotes exactly one
  // price (landing.test.tsx). A mock rent here would contradict it.
  it("quotes no price", () => {
    expect(svgOf(Sketch).textContent).not.toMatch(/CHF|\$|€/);
  });
});

describe("HeroSketch", () => {
  it("marks mock flats around the city (#326)", () => {
    const text = svgOf(HeroSketch).textContent;
    expect(text).toContain("Flat A · big kitchen");
    expect(text).toContain("Flat C · too far?");
    expect(text).toContain("work · 20 min");
  });

  // The hero is 672px tall from xl up, so of the 760-unit viewBox it shows
  // y 44–716. A note outside that band is cut off, as "too dark?" and "our
  // favourite" were before #326.
  it("keeps every note inside the band the hero shows", () => {
    const notes = [...svgOf(HeroSketch).querySelectorAll("text")];
    expect(notes.length).toBeGreaterThan(0);
    for (const note of notes) {
      const y = Number(note.getAttribute("y"));
      const size = Number(note.getAttribute("font-size") ?? 26);
      expect(y - size, note.textContent ?? "").toBeGreaterThanOrEqual(44);
      expect(y, note.textContent ?? "").toBeLessThanOrEqual(716);
    }
  });
});

describe("InsideSketch and DecidedSketch", () => {
  it("carry the hunt on to a decision", () => {
    expect(svgOf(InsideSketch).textContent).toContain("Flat B · both love it!");
    expect(svgOf(DecidedSketch).textContent).toContain("decided: Flat B");
  });
});
