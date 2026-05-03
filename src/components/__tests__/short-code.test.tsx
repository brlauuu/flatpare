import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
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

  it("copies the code on button click and flips to the checkmark", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<ShortCode code="ABC-3B-2b-WY-4057" />);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Copy ABC-3B-2b-WY-4057/i })
      );
    });

    expect(writeText).toHaveBeenCalledWith("ABC-3B-2b-WY-4057");
    expect(screen.getByRole("button", { name: /Copied/i })).toBeInTheDocument();
  });

  it("reverts to the Copy state after the timeout", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<ShortCode code="DEF-3B-2b-WY-4057" />);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Copy DEF-3B-2b-WY-4057/i })
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(1300);
    });

    expect(
      screen.getByRole("button", { name: /Copy DEF-3B-2b-WY-4057/i })
    ).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("swallows clipboard rejections without crashing", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("denied");
    });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<ShortCode code="XYZ-3B-2b-WY-4057" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Copy XYZ/i }));
    });

    expect(writeText).toHaveBeenCalled();
    // Stayed on the Copy state since the success handler never ran.
    expect(
      screen.getByRole("button", { name: /Copy XYZ-3B-2b-WY-4057/i })
    ).toBeInTheDocument();
  });
});
