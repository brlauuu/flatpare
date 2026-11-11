import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithHouseholdData } from "@/components/household-data/__tests__/fake-household-data";
import { RedeemCreditCode } from "../redeem-credit-code";

afterEach(cleanup);

const BETA = { granted: 40, used: 40, remaining: 0, purchasable: false };
const CODE = "0123456789abcdef0123456789abcdef";

// #492: a credit code from the operator tops the household up.
describe("RedeemCreditCode", () => {
  it("renders nothing where credits are not counted", () => {
    renderWithHouseholdData(<RedeemCreditCode />, { credits: null });
    expect(screen.queryByLabelText("Credit code")).toBeNull();
  });

  it("sits at the anchor the balance links to, and says how to get a code during the beta", () => {
    renderWithHouseholdData(<RedeemCreditCode />, { credits: BETA });
    expect(document.getElementById("redeem-code")).toContainElement(screen.getByLabelText("Credit code"));
    expect(screen.getByText(/Ask for a code with Send feedback/)).toBeInTheDocument();
  });

  it("drops the beta hint once credits can be bought, and keeps the form", () => {
    renderWithHouseholdData(<RedeemCreditCode />, { credits: { ...BETA, purchasable: true } });
    expect(screen.getByLabelText("Credit code")).toBeInTheDocument();
    expect(screen.queryByText(/Send feedback/)).toBeNull();
  });

  it("is disabled until something is typed", () => {
    renderWithHouseholdData(<RedeemCreditCode />, { credits: BETA });
    expect(screen.getByRole("button", { name: "Redeem" })).toBeDisabled();
  });

  it("redeems the code, says how many were added and clears the field", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<RedeemCreditCode />, { credits: BETA });
    vi.mocked(value.redeemCreditCode).mockResolvedValue(20);
    await user.click(screen.getByLabelText("Credit code"));
    await user.paste(CODE);
    await user.click(screen.getByRole("button", { name: "Redeem" }));
    expect(value.redeemCreditCode).toHaveBeenCalledWith(CODE);
    expect(await screen.findByRole("status")).toHaveTextContent("20 credits added.");
    expect(screen.getByLabelText("Credit code")).toHaveValue("");
  });

  it("shows the server's message when the code is refused, and keeps what was typed", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<RedeemCreditCode />, { credits: BETA });
    vi.mocked(value.redeemCreditCode).mockRejectedValue(new Error("That code is not valid."));
    await user.click(screen.getByLabelText("Credit code"));
    await user.paste(CODE);
    await user.click(screen.getByRole("button", { name: "Redeem" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That code is not valid.");
    expect(screen.getByLabelText("Credit code")).toHaveValue(CODE);
    expect(screen.getByRole("button", { name: "Redeem" })).toBeEnabled();
  });

  it("falls back to its own words when the failure carries none", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<RedeemCreditCode />, { credits: BETA });
    vi.mocked(value.redeemCreditCode).mockRejectedValue("boom");
    await user.click(screen.getByLabelText("Credit code"));
    await user.paste(CODE);
    await user.click(screen.getByRole("button", { name: "Redeem" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The code could not be redeemed. Try again.");
  });
});
