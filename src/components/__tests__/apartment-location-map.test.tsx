import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("../map/map-fonts", () => ({ mapFontVariables: "" }));
vi.mock("../map/pin-map-inner", () => ({
  default: ({ latitude, longitude, label, onError }: { latitude: number; longitude: number; label: string; onError: () => void }) => (
    <div data-testid="pin-map">
      {label} @ {latitude},{longitude}
      <button onClick={onError}>fail</button>
    </div>
  ),
}));

import { ApartmentLocationMap } from "../apartment-location-map";

afterEach(() => cleanup());

describe("ApartmentLocationMap", () => {
  it("renders nothing when a coordinate is missing", () => {
    const { container } = render(
      <ApartmentLocationMap latitude={null} longitude={8.5} label="Sonnenweg 3" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the pin map when both coordinates are present", async () => {
    render(<ApartmentLocationMap latitude={47.37} longitude={8.54} label="Sonnenweg 3" />);
    expect(await screen.findByTestId("pin-map")).toHaveTextContent("Sonnenweg 3 @ 47.37,8.54");
  });

  it("says so when the map cannot load", async () => {
    render(<ApartmentLocationMap latitude={47.37} longitude={8.54} label="Sonnenweg 3" />);
    fireEvent.click(await screen.findByRole("button", { name: "fail" }));
    expect(screen.getByText("The map couldn't load.")).toBeInTheDocument();
    expect(screen.queryByTestId("pin-map")).not.toBeInTheDocument();
  });
});
