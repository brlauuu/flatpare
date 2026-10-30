import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithHouseholdData } from "@/components/household-data/__tests__/fake-household-data";
import { setTestLocale } from "@/i18n/__tests__/test-locale";
import { AddedByLine } from "../added-by-line";

afterEach(() => {
  cleanup();
  setTestLocale("en");
});

const NAMES = { "u-me": "Me", "u-lena": "Lena" };
const line = () => document.querySelector("[data-added-by]");

// #430: who added an apartment, resolved against the current members.
describe("AddedByLine", () => {
  it("names the member who added it", () => {
    renderWithHouseholdData(<AddedByLine addedBy="u-lena" />, { memberNames: NAMES });
    expect(screen.getByText("Added by Lena")).toBeInTheDocument();
  });

  it("says you when it was you", () => {
    renderWithHouseholdData(<AddedByLine addedBy="u-me" />, { memberNames: NAMES });
    expect(line()).toHaveTextContent("Added by you");
  });

  it("says a former member for someone who has left", () => {
    renderWithHouseholdData(<AddedByLine addedBy="u-gone" />, { memberNames: NAMES });
    expect(line()).toHaveTextContent("Added by a former member");
  });

  it("shows nothing when nobody knows, or before the names have arrived", () => {
    renderWithHouseholdData(<AddedByLine addedBy={null} />, { memberNames: NAMES });
    expect(line()).toBeNull();
    cleanup();
    renderWithHouseholdData(<AddedByLine addedBy="u-lena" />, { memberNames: null });
    expect(line()).toBeNull();
  });

  it("is worded in the reader's language", () => {
    setTestLocale("de");
    renderWithHouseholdData(<AddedByLine addedBy="u-lena" />, { memberNames: NAMES });
    expect(line()).toHaveTextContent("Hinzugefügt von Lena");
  });
});
