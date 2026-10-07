import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { HIDE_DELAY_MS, useCardState } from "../use-card-state";

afterEach(() => vi.useRealTimers());

describe("useCardState", () => {
  it("shows and hides", () => {
    const { result } = renderHook(() => useCardState());
    act(() => result.current.show({ kind: "apartment", id: "a1" }));
    expect(result.current.active).toEqual({ kind: "apartment", id: "a1" });
    act(() => result.current.hide());
    expect(result.current.active).toBeNull();
  });

  it("hides after a short delay, so the pointer can move from the mark onto the card", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCardState());
    act(() => result.current.show({ kind: "apartment", id: "a1" }));
    act(() => result.current.hideSoon());
    expect(result.current.active).not.toBeNull();
    act(() => vi.advanceTimersByTime(HIDE_DELAY_MS));
    expect(result.current.active).toBeNull();
  });

  it("entering the card cancels the pending hide", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCardState());
    act(() => result.current.show({ kind: "apartment", id: "a1" }));
    act(() => result.current.hideSoon());
    act(() => result.current.cancelHide());
    act(() => vi.advanceTimersByTime(HIDE_DELAY_MS * 2));
    expect(result.current.active).toEqual({ kind: "apartment", id: "a1" });
  });

  it("keeps its functions stable across renders", () => {
    const { result, rerender } = renderHook(() => useCardState());
    const first = result.current;
    act(() => result.current.show({ kind: "location", id: "l1" }));
    rerender();
    expect(result.current.show).toBe(first.show);
    expect(result.current.hideSoon).toBe(first.hideSoon);
  });
});
