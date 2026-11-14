import { describe, it, expect, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { HouseholdCredits } from "../household-credits";
import { renderWithHouseholdData } from "@/components/household-data/__tests__/fake-household-data";

afterEach(cleanup);

const credits = (remaining: number, purchasable = true) => ({
  granted: 40,
  used: 40 - remaining,
  remaining,
  purchasable,
});

describe("HouseholdCredits", () => {
  it("renders nothing when credits are not counted", () => {
    // A self-hoster must not see a quota that does not exist.
    renderWithHouseholdData(<HouseholdCredits />, { credits: null });
    expect(screen.queryByRole("heading", { name: "Credits" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("credit-balance")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Credit code")).not.toBeInTheDocument();
  });

  it.each(["owner", "member"] as const)(
    "gives the %s the balance, buying more and the code form under its own heading (#294, #305)",
    (role) => {
      // One shared pool: everyone sees what is left and can add to it.
      renderWithHouseholdData(<HouseholdCredits />, {
        credits: credits(0),
        identity: { userId: "u-me", householdId: 7, userName: "Me", role },
      });
      const section = screen.getByRole("region", { name: "Credits" });
      expect(section).toContainElement(screen.getByTestId("credit-balance"));
      expect(screen.getByTestId("credit-balance")).toHaveTextContent("0 apartments left to process");
      expect(screen.getByRole("link", { name: "Buy more" })).toHaveAttribute("href", "/billing");
      expect(section).toContainElement(screen.getByLabelText("Credit code"));
    }
  );

  it("offers a code instead of a checkout when nothing can be bought (#492)", () => {
    renderWithHouseholdData(<HouseholdCredits />, { credits: credits(3, false) });
    expect(screen.getByRole("link", { name: "Redeem a code" })).toHaveAttribute("href", "/household#redeem-code");
    expect(screen.queryByRole("link", { name: "Buy more" })).not.toBeInTheDocument();
  });
});
