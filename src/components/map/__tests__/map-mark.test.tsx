import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MapMark } from "../map-mark";

afterEach(cleanup);

function setup(over: Partial<React.ComponentProps<typeof MapMark>> = {}) {
  const props = {
    kind: "apartment" as const,
    label: "BS-01",
    seed: 1,
    ariaLabel: "BS-01, opens apartment",
    hoverCapable: true,
    onShow: vi.fn(),
    onHide: vi.fn(),
    onDismiss: vi.fn(),
    onOpen: vi.fn(),
    ...over,
  };
  render(<MapMark {...props} />);
  return { props, mark: screen.getByRole("button", { name: props.ariaLabel }) };
}

describe("MapMark", () => {
  it("shows its handwritten label", () => {
    setup();
    expect(screen.getByText("BS-01")).toBeInTheDocument();
  });

  it("with a mouse: hover shows the card, leaving hides it, click opens the apartment", () => {
    const { props, mark } = setup();
    fireEvent.mouseEnter(mark);
    expect(props.onShow).toHaveBeenCalled();
    fireEvent.mouseLeave(mark);
    expect(props.onHide).toHaveBeenCalled();
    fireEvent.click(mark);
    expect(props.onOpen).toHaveBeenCalledTimes(1);
  });

  it("on a touch screen: a tap shows the card and does not open the apartment", () => {
    const { props, mark } = setup({ hoverCapable: false });
    fireEvent.click(mark);
    expect(props.onShow).toHaveBeenCalled();
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it("on a touch screen: hover events do nothing", () => {
    const { props, mark } = setup({ hoverCapable: false });
    fireEvent.mouseEnter(mark);
    expect(props.onShow).not.toHaveBeenCalled();
  });

  it("with a keyboard: focus shows, Enter opens, Escape dismisses", () => {
    const { props, mark } = setup();
    fireEvent.focus(mark);
    expect(props.onShow).toHaveBeenCalled();
    fireEvent.keyDown(mark, { key: "Enter" });
    expect(props.onOpen).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(mark, { key: "Escape" });
    expect(props.onDismiss).toHaveBeenCalled();
  });

  it("a location has nothing to open: click only shows its card", () => {
    const { props, mark } = setup({ kind: "location", onOpen: undefined, ariaLabel: "Office" });
    fireEvent.click(mark);
    expect(props.onShow).toHaveBeenCalled();
  });
});
