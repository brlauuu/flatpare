import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Input } from "../input";
import { Textarea } from "../textarea";

afterEach(cleanup);

// #324: fields come in two weights. Dense (1px) is the default, for fields
// inside multi-field forms; frame (3px) is for the few standalone fields —
// search, sort, passphrase, recovery code.
describe("field weight", () => {
  it("defaults to dense", () => {
    render(<Input aria-label="a" />);
    render(<Textarea aria-label="b" />);
    expect(screen.getByLabelText("a").dataset.weight).toBe("dense");
    expect(screen.getByLabelText("b").dataset.weight).toBe("dense");
  });

  it("takes the frame weight when asked", () => {
    render(<Input aria-label="a" weight="frame" />);
    render(<Textarea aria-label="b" weight="frame" />);
    const input = screen.getByLabelText("a");
    expect(input.dataset.weight).toBe("frame");
    expect(input.className).toMatch(/border-3/);
    expect(input.className).toMatch(/border-frame/);
    expect(screen.getByLabelText("b").dataset.weight).toBe("frame");
  });

  it("does not pass weight through to the DOM as an attribute", () => {
    render(<Input aria-label="a" weight="frame" />);
    expect(screen.getByLabelText("a").hasAttribute("weight")).toBe(false);
  });
});
