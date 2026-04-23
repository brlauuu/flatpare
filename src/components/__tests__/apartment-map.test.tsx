import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ApartmentMap } from "../apartment-map";

afterEach(() => cleanup());

describe("ApartmentMap", () => {
  it("renders nothing when embedUrl is null", () => {
    const { container } = render(
      <ApartmentMap embedUrl={null} title="Test" />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders an iframe with the given src and a title", () => {
    const url =
      "https://www.google.com/maps/embed/v1/place?key=k&q=Basel+4057";
    const { container } = render(
      <ApartmentMap embedUrl={url} title="Sonnenweg 3" />
    );
    const iframe = container.querySelector("iframe")!;
    expect(iframe).not.toBeNull();
    expect(iframe.getAttribute("src")).toBe(url);
    expect(iframe.getAttribute("title")).toBe("Map for Sonnenweg 3");
    expect(iframe.getAttribute("loading")).toBe("lazy");
  });
});
