import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ApartmentPagerNav } from "../apartment-pager-nav";

afterEach(cleanup);

function renderNav(over: Partial<React.ComponentProps<typeof ApartmentPagerNav>> = {}) {
  const onNavigate = vi.fn();
  render(
    <ApartmentPagerNav
      prevId="a"
      nextId="b"
      position={2}
      total={5}
      onNavigate={onNavigate}
      {...over}
    />
  );
  return { onNavigate };
}

const prev = () => screen.getByRole("button", { name: /previous/i });
const next = () => screen.getByRole("button", { name: /next/i });

describe("ApartmentPagerNav", () => {
  it("navigates to the neighbouring apartments", async () => {
    const { onNavigate } = renderNav();
    await userEvent.click(prev());
    expect(onNavigate).toHaveBeenCalledWith("a");
    await userEvent.click(next());
    expect(onNavigate).toHaveBeenCalledWith("b");
  });

  it("shows the position within the list", () => {
    renderNav();
    expect(screen.getByText("2 of 5")).toBeInTheDocument();
  });

  describe("at the ends of the list", () => {
    it("disables Previous on the first apartment", () => {
      renderNav({ prevId: null, position: 1 });
      expect(prev()).toBeDisabled();
      expect(next()).toBeEnabled();
    });

    it("disables Next on the last apartment", () => {
      renderNav({ nextId: null, position: 5 });
      expect(next()).toBeDisabled();
      expect(prev()).toBeEnabled();
    });

    it("does not navigate when a disabled end is clicked", async () => {
      // The guard inside onClick is belt-and-braces over `disabled`, and it
      // is the uncovered branch the audit flagged. A click on a disabled
      // button should reach nothing either way.
      const { onNavigate } = renderNav({ prevId: null, nextId: null });
      await userEvent.click(prev());
      await userEvent.click(next());
      expect(onNavigate).not.toHaveBeenCalled();
    });
  });

  describe("hides the counter when there is nothing to count", () => {
    // Both halves of the condition, since either alone would render "null of
    // 5" or "2 of 0" — visible nonsense rather than a blank.
    it("no position", () => {
      renderNav({ position: null });
      expect(screen.queryByText(/of 5/)).not.toBeInTheDocument();
    });

    it("no total", () => {
      renderNav({ total: 0 });
      expect(screen.queryByText(/^2 of/)).not.toBeInTheDocument();
    });

    it("still renders both buttons", () => {
      renderNav({ position: null, total: 0 });
      expect(prev()).toBeInTheDocument();
      expect(next()).toBeInTheDocument();
    });
  });
});
