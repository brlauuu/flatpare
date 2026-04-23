import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddressLink } from "../address-link";

let openMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  openMock = vi.fn();
  vi.stubGlobal("open", openMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AddressLink", () => {
  it("renders nothing when address is null", () => {
    const { container } = render(<AddressLink address={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("opens Google Maps in a new tab when clicked", async () => {
    const user = userEvent.setup();
    render(<AddressLink address="Sonnenweg 3, 8001 Zurich" />);

    const btn = screen.getByRole("button", {
      name: /Open Sonnenweg 3, 8001 Zurich in Google Maps/,
    });
    await user.click(btn);

    expect(openMock).toHaveBeenCalledOnce();
    const [url, target, features] = openMock.mock.calls[0];
    expect(url).toBe(
      "https://www.google.com/maps/search/?api=1&query=Sonnenweg%203%2C%208001%20Zurich"
    );
    expect(target).toBe("_blank");
    expect(String(features)).toContain("noopener");
  });

  it("stops propagation so outer <Link> wrappers don't navigate", async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    render(
      <div onClick={outer}>
        <AddressLink address="Some St 1" />
      </div>
    );
    await user.click(screen.getByRole("button"));
    expect(openMock).toHaveBeenCalled();
    expect(outer).not.toHaveBeenCalled();
  });
});
