import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LocationIconPicker } from "../location-icon-picker";

afterEach(cleanup);

// #324: dialogs take the frame. This is the app's only hand-built dialog.
describe("LocationIconPicker frame", () => {
  it("draws its panel with the frame line and shadow", () => {
    render(<LocationIconPicker open selected="work" onPick={vi.fn()} onClose={vi.fn()} />);
    const panel = screen.getByRole("dialog", { name: "Pick an icon" }).firstElementChild!;
    expect(panel.className).toContain("border-frame");
    expect(panel.className).toContain("shadow-frame");
  });
});
