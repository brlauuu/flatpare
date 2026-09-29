import { describe, it, expect, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { CreditBalance } from "../credit-balance";
import { renderWithHouseholdData } from "@/components/household-data/__tests__/fake-household-data";

afterEach(cleanup);

const credits = (remaining: number, granted = 40) => ({ granted, used: granted - remaining, remaining });
const number = () => screen.getByTestId("credit-balance").querySelector("[data-level]") as HTMLElement;

describe("CreditBalance", () => {
  it("renders nothing when billing is off", () => {
    // A self-hoster must not see a quota that does not exist.
    renderWithHouseholdData(<CreditBalance />, { credits: null });
    expect(screen.queryByTestId("credit-balance")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /buy more/i })).not.toBeInTheDocument();
  });

  it.each([
    [40, "ok"],
    [6, "ok"],
    [5, "low"],
    [1, "low"],
    [0, "empty"],
  ])("marks %i remaining as %s", (remaining, level) => {
    renderWithHouseholdData(<CreditBalance />, { credits: credits(remaining) });
    expect(number()).toHaveTextContent(String(remaining));
    expect(number().dataset.level).toBe(level);
  });

  it("is orange when low and red when empty", () => {
    const { unmount } = renderWithHouseholdData(<CreditBalance />, { credits: credits(3) });
    expect(number().className).toMatch(/text-orange-/);
    unmount();
    renderWithHouseholdData(<CreditBalance />, { credits: credits(0) });
    expect(number().className).toMatch(/text-destructive/);
  });

  it("does not rely on colour alone", () => {
    const { unmount } = renderWithHouseholdData(<CreditBalance />, { credits: credits(3) });
    expect(screen.getByTestId("credit-balance")).toHaveTextContent(/running low/i);
    unmount();
    renderWithHouseholdData(<CreditBalance />, { credits: credits(0) });
    expect(screen.getByTestId("credit-balance")).toHaveTextContent(/none left/i);
  });

  it.each([40, 5, 0])("offers buying more with %i remaining, not only at zero", (remaining) => {
    renderWithHouseholdData(<CreditBalance />, { credits: credits(remaining) });
    expect(screen.getByRole("link", { name: /buy more/i })).toHaveAttribute("href", "/billing");
  });

  it("says it counts apartments to ADD, and handles the singular", () => {
    const { unmount } = renderWithHouseholdData(<CreditBalance />, { credits: credits(12) });
    expect(screen.getByTestId("credit-balance")).toHaveTextContent("12 apartments left to add");
    unmount();
    renderWithHouseholdData(<CreditBalance />, { credits: credits(1) });
    expect(screen.getByTestId("credit-balance")).toHaveTextContent("1 apartment left to add");
  });
});
