import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  renderWithHouseholdData,
  makeApartmentView,
} from "@/components/household-data/__tests__/fake-household-data";
import { ApartmentCard } from "../apartment-card";

const APT = makeApartmentView({ id: "a1", name: "Sonnenweg 3" });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// #437: delete straight from the card, after a confirmation.
describe("ApartmentCard quick delete", () => {
  it("names the apartment, and sits beside the link rather than inside it", () => {
    renderWithHouseholdData(<ApartmentCard apt={APT} />);
    const button = screen.getByRole("button", { name: "Delete Sonnenweg 3" });
    expect(button.closest("a")).toBeNull();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/apartments/a1");
  });

  it("deletes the apartment once confirmed", async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<ApartmentCard apt={APT} />);
    await user.click(screen.getByRole("button", { name: "Delete Sonnenweg 3" }));
    expect(confirm).toHaveBeenCalledWith('Delete "Sonnenweg 3"? This cannot be undone.');
    await waitFor(() => expect(value.deleteApartment).toHaveBeenCalledWith("a1"));
  });

  it("deletes nothing when the confirmation is declined", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<ApartmentCard apt={APT} />);
    await user.click(screen.getByRole("button", { name: "Delete Sonnenweg 3" }));
    expect(value.deleteApartment).not.toHaveBeenCalled();
  });

  it("says so when the delete fails, and offers the button again", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<ApartmentCard apt={APT} />);
    vi.mocked(value.deleteApartment).mockRejectedValueOnce(new Error("Network error"));
    await user.click(screen.getByRole("button", { name: "Delete Sonnenweg 3" }));
    expect(await screen.findByRole("alert")).toHaveTextContent('Couldn\'t delete "Sonnenweg 3". Try again.');
    expect(screen.getByRole("button", { name: "Delete Sonnenweg 3" })).toBeEnabled();
  });
});
