import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/components/crypto/encryption-settings", () => ({
  EncryptionSettings: () => <div data-testid="encryption-settings" />,
}));

vi.mock("@/components/account-name-settings", () => ({
  AccountNameSettings: () => <div data-testid="account-name-settings" />,
}));

import SettingsPage from "../page";

afterEach(cleanup);

// Since #298 Settings is about the person, not the group.
describe("SettingsPage", () => {
  it("shows the encryption settings and points to the Household page", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByTestId("encryption-settings")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Household" })).toHaveAttribute("href", "/household");
  });

  it("lets the person set their name, above the encryption settings (#327)", () => {
    render(<SettingsPage />);
    const name = screen.getByTestId("account-name-settings");
    expect(name.compareDocumentPosition(screen.getByTestId("encryption-settings")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("holds nothing about members or locations any more", () => {
    render(<SettingsPage />);
    expect(screen.queryByRole("heading", { name: /Locations of interest|Household/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Invite|Add location|Recompute/i })).not.toBeInTheDocument();
  });
});
