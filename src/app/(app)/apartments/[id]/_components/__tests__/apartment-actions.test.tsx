import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ApartmentActions } from "../apartment-actions";
import { showOnMapHref } from "../show-on-map";

afterEach(cleanup);

function renderActions(mapHref: string | null, canReprocess = true) {
  const noop = vi.fn();
  render(
    <ApartmentActions
      hasPdf
      canReprocess={canReprocess}
      listingUrl="https://example.ch/1"
      mapHref={mapHref}
      editing={false}
      reprocessing={false}
      deleting={false}
      onEdit={noop}
      onViewPdf={noop}
      onReprocess={noop}
      onDelete={noop}
    />
  );
}

describe("ApartmentActions (#407)", () => {
  it("offers Show on map with the other actions", () => {
    renderActions("/map?highlight=a1");
    expect(screen.getByRole("link", { name: "View on map" })).toHaveAttribute("href", "/map?highlight=a1");
  });

  it("has no map action for an apartment without coordinates", () => {
    renderActions(null);
    expect(screen.queryByRole("link", { name: "View on map" })).toBeNull();
  });

  it("gives every action an icon and a name for screen readers", () => {
    renderActions("/map?highlight=a1");
    for (const name of ["View PDF", "Original Listing", "View on map", "Edit", "Reprocess", "Delete"]) {
      const el = screen.getByRole(name === "Original Listing" || name === "View on map" ? "link" : "button", { name });
      expect(el.querySelector("svg")).not.toBeNull();
      expect(el).toHaveAttribute("title");
    }
  });
});

describe("Reprocess (#413)", () => {
  it("is available only for a processed apartment with something to process", () => {
    renderActions(null, true);
    expect(screen.getByRole("button", { name: "Reprocess" })).toBeEnabled();
    cleanup();
    renderActions(null, false);
    expect(screen.getByRole("button", { name: "Reprocess" })).toBeDisabled();
  });
});

describe("showOnMapHref", () => {
  it("links the household map with the apartment highlighted", () => {
    expect(showOnMapHref({ id: "a 1", latitude: 47.5, longitude: 7.6 })).toBe("/map?highlight=a%201");
  });

  it("is null without coordinates", () => {
    expect(showOnMapHref({ id: "a1", latitude: null, longitude: 7.6 })).toBeNull();
  });
});
