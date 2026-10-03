import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Button } from "../button";
import { Input } from "../input";

afterEach(cleanup);

// #324 final review. A translucent ring on white measured 2.37:1, under
// WCAG 1.4.11's 3:1; the focus ring is full strength and offset from the
// button so it stays visible on a blue (or yellow) fill.
describe("focus indicator", () => {
  it("uses a full-strength, offset ring on buttons", () => {
    render(<><Button>Go</Button><Button variant="destructive">Delete</Button></>);
    for (const name of ["Go", "Delete"]) {
      const cls = screen.getByRole("button", { name }).className;
      expect(cls).not.toMatch(/focus-visible:ring-[a-z]+\/\d+/);
      expect(cls).toContain("focus-visible:ring-offset-2");
    }
  });

  it("uses a full-strength ring on fields", () => {
    render(<Input aria-label="a" />);
    expect(screen.getByLabelText("a").className).not.toMatch(/focus-visible:ring-ring\/\d+/);
  });
});

// The press (move into the shadow) belongs to the framed variants only, and
// only for people who have not asked for reduced motion.
describe("press", () => {
  it("is motion-safe on framed variants", () => {
    render(<Button>Go</Button>);
    const cls = screen.getByRole("button", { name: "Go" }).className;
    expect(cls).toContain("motion-safe:active:not-aria-[haspopup]:translate-x-[3px]");
    expect(cls).not.toMatch(/(^|\s)active:not-aria-\[haspopup\]:translate/);
  });

  it("never applies to ghost or link buttons", () => {
    render(<><Button variant="ghost">G</Button><Button variant="link">L</Button></>);
    for (const name of ["G", "L"]) {
      const cls = screen.getByRole("button", { name }).className;
      expect(cls).not.toContain("shadow-pressed");
      expect(cls).not.toContain("translate-x-[3px]");
    }
  });
});
