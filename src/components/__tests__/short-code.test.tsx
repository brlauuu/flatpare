import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ShortCode } from "../short-code";

afterEach(() => cleanup());

describe("ShortCode", () => {
  it("renders nothing when code is null", () => {
    const { container } = render(<ShortCode code={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders with sm size by default", () => {
    render(<ShortCode code="JQI-3B-2b-WY-4057" />);
    const wrapper = screen.getByText("JQI-3B-2b-WY-4057").parentElement!;
    expect(wrapper).toHaveAttribute("data-short-code-size", "sm");
  });

  it("respects size='lg' for the prominent variant", () => {
    render(<ShortCode code="JQI-3B-2b-WY-4057" size="lg" />);
    const wrapper = screen.getByText("JQI-3B-2b-WY-4057").parentElement!;
    expect(wrapper).toHaveAttribute("data-short-code-size", "lg");
    expect(wrapper.className).toContain("text-base");
  });

  it("respects size='md'", () => {
    render(<ShortCode code="JQI-3B-2b-WY-4057" size="md" />);
    const wrapper = screen.getByText("JQI-3B-2b-WY-4057").parentElement!;
    expect(wrapper).toHaveAttribute("data-short-code-size", "md");
    expect(wrapper.className).toContain("text-sm");
  });
});
