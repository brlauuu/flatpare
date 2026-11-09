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

  it("draws the highlighted apartment heavier and marks it current (#384)", () => {
    const { mark } = setup({ highlighted: true });
    expect(mark).toHaveClass("map-mark-highlighted");
    expect(mark).toHaveAttribute("aria-current", "true");
    expect(mark.querySelector("path")).toHaveAttribute("stroke-width", "3.6");
  });

  it("draws an apartment as a scribbled dot alone, with no circle around it (#479)", () => {
    const { mark } = setup();
    expect(mark.querySelectorAll("path")).toHaveLength(1);
    expect(mark.querySelector("circle")).toBeNull();
    expect(mark.querySelector("svg.lucide")).toBeNull();
  });

  it("draws a place with the icon it has on the apartment page (#479)", () => {
    const { mark } = setup({ kind: "location", icon: "Train", onOpen: undefined, ariaLabel: "Station" });
    expect(mark.querySelector("svg.lucide-train")).not.toBeNull();
    expect(mark.querySelector("svg.lucide-train")).toHaveAttribute("aria-hidden", "true");
  });

  it("draws a place with an unknown icon as a pin, as the apartment page does", () => {
    const { mark } = setup({ kind: "location", icon: "Nope", onOpen: undefined, ariaLabel: "Somewhere" });
    expect(mark.querySelector("svg.lucide-map-pin")).not.toBeNull();
  });

  it("is not current unless highlighted", () => {
    const { mark } = setup();
    expect(mark).not.toHaveClass("map-mark-highlighted");
    expect(mark).not.toHaveAttribute("aria-current");
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
