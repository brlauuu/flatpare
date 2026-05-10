import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DistanceSection } from "../distance-section";
import type { LocationLite } from "../types";

const locations: LocationLite[] = [
  { id: 1, label: "Train Station", icon: "Train", address: "Basel SBB" },
  { id: 2, label: "Work", icon: "Briefcase", address: "Zurich HQ" },
];

afterEach(() => {
  cleanup();
});

describe("DistanceSection", () => {
  it("renders one row per location with bike + transit minutes", () => {
    render(
      <DistanceSection
        locations={locations}
        distances={[
          { locationId: 1, bikeMin: 12, transitMin: 25 },
          { locationId: 2, bikeMin: 18, transitMin: 32 },
        ]}
        apartmentAddress="Sonnenweg 3, 8001 Zurich"
      />
    );
    expect(screen.getByText("Train Station")).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText(/12 min bike.*25 min transit/)).toBeInTheDocument();
    expect(screen.getByText(/18 min bike.*32 min transit/)).toBeInTheDocument();
  });

  it("falls back to em-dash when bike or transit is null", () => {
    render(
      <DistanceSection
        locations={[locations[0]]}
        distances={[
          { locationId: 1, bikeMin: null, transitMin: 25 },
        ]}
        apartmentAddress="Sonnenweg 3"
      />
    );
    expect(screen.getByText(/— bike.*25 min transit/)).toBeInTheDocument();
  });

  it("falls back to em-dash when both are null", () => {
    render(
      <DistanceSection
        locations={[locations[0]]}
        distances={[
          { locationId: 1, bikeMin: null, transitMin: null },
        ]}
        apartmentAddress="Sonnenweg 3"
      />
    );
    expect(screen.getByText(/— bike.*— transit/)).toBeInTheDocument();
  });

  it("treats a missing distance entry the same as both nulls", () => {
    render(
      <DistanceSection
        locations={[locations[0]]}
        distances={[]}
        apartmentAddress="Sonnenweg 3"
      />
    );
    expect(screen.getByText(/— bike.*— transit/)).toBeInTheDocument();
  });

  it("wraps the icon in a Google Maps directions link when an address is given", () => {
    render(
      <DistanceSection
        locations={[locations[0]]}
        distances={[{ locationId: 1, bikeMin: 12, transitMin: 25 }]}
        apartmentAddress="Sonnenweg 3, 8001 Zurich"
      />
    );
    const link = screen.getByRole("link", {
      name: /Bike directions to Train Station/i,
    });
    expect(link.getAttribute("href")).toContain(
      "google.com/maps/dir/?api=1"
    );
    expect(link.getAttribute("href")).toContain(
      encodeURIComponent("Sonnenweg 3, 8001 Zurich")
    );
    expect(link.getAttribute("href")).toContain(
      encodeURIComponent("Basel SBB")
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders a static icon (no link) when apartmentAddress is null", () => {
    render(
      <DistanceSection
        locations={[locations[0]]}
        distances={[{ locationId: 1, bikeMin: 12, transitMin: 25 }]}
        apartmentAddress={null}
      />
    );
    expect(
      screen.queryByRole("link", { name: /Bike directions to Train Station/i })
    ).toBeNull();
  });
});
