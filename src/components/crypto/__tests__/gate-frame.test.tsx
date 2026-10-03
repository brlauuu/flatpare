import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GateFrame } from "../gate-frame";

afterEach(cleanup);

describe("GateFrame", () => {
  it("frames the screen it wraps", () => {
    render(<GateFrame><p>inside</p></GateFrame>);
    expect(screen.getByText("inside")).toBeInTheDocument();
    expect(screen.getByTestId("gate-frame").className).toMatch(/shadow-hero/);
  });

  // The recovery kit is printed on paper: no grid, no shadow, no border,
  // no yellow (#324 review focus).
  it("drops every decoration when printed", () => {
    render(<GateFrame><p>inside</p></GateFrame>);
    const card = screen.getByTestId("gate-frame");
    const page = card.parentElement!;
    for (const cls of ["print:shadow-none", "print:border-0", "print:bg-white", "print:text-black"]) {
      expect(card.className).toContain(cls);
    }
    expect(page.className).toContain("print:bg-none");
  });
});
