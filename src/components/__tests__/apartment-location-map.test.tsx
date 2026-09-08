import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("../apartment-location-map-inner", () => ({
  default: ({ latitude, longitude, label }: { latitude: number; longitude: number; label: string }) => (
    <div data-testid="leaflet-pin">
      {label} @ {latitude},{longitude}
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

  it("renders the Leaflet pin when both coordinates are present", async () => {
    render(<ApartmentLocationMap latitude={47.37} longitude={8.54} label="Sonnenweg 3" />);
    expect(await screen.findByTestId("leaflet-pin")).toHaveTextContent("Sonnenweg 3 @ 47.37,8.54");
  });
});
