import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { StarRating } from "../star-rating";

afterEach(() => {
  cleanup();
});

describe("StarRating", () => {
  it("renders 5 star buttons", async () => {
    await act(async () => {
      render(<StarRating value={0} />);
    });
    expect(screen.getAllByRole("button")).toHaveLength(5);
  });

  it("calls onChange with star value on click", async () => {
    const onChange = vi.fn();

    await act(async () => {
      render(<StarRating value={0} onChange={onChange} />);
    });

    await act(async () => {
      screen.getAllByRole("button")[2].click();
    });

    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("toggles off when clicking the currently selected star", async () => {
    const onChange = vi.fn();

    await act(async () => {
      render(<StarRating value={3} onChange={onChange} />);
    });

    await act(async () => {
      screen.getAllByRole("button")[2].click();
    });

    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("disables buttons in readonly mode", async () => {
    await act(async () => {
      render(<StarRating value={4} readonly={true} />);
    });

    screen.getAllByRole("button").forEach((button) => {
      expect(button).toHaveAttribute("disabled");
    });
  });

  it("does not call onChange in readonly mode", async () => {
    const onChange = vi.fn();

    await act(async () => {
      render(<StarRating value={3} onChange={onChange} readonly={true} />);
    });

    await act(async () => {
      screen.getAllByRole("button")[0].click();
    });

    expect(onChange).not.toHaveBeenCalled();
  });
});
