import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StatusBadge } from "../status-badge";

afterEach(cleanup);

describe("StatusBadge", () => {
  // #324 final review: success text on a 15% success tint measured 4.39:1,
  // under 4.5:1. On the card colour it is 5.5:1 and up.
  it("shows Saved as success text on the card colour, not on a tint", () => {
    render(<StatusBadge status="done" saved />);
    const cls = screen.getByText("Saved").className;
    expect(cls).toContain("text-success");
    expect(cls).toContain("bg-card");
    expect(cls).not.toMatch(/bg-success\//);
  });
});
