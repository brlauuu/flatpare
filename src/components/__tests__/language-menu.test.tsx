import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setTestLocale } from "@/i18n/__tests__/test-locale";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { LanguageMenu } from "../language-menu";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  fetchMock = vi.fn(async () => new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
  document.cookie = "flatpare_locale=; max-age=0; path=/";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function open() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Language: English/ }));
  return user;
}

describe("LanguageMenu (#288)", () => {
  it("shows the current language and offers all five, each named in itself", async () => {
    render(<LanguageMenu />);
    await open();
    for (const name of ["English", "Deutsch", "Français", "Italiano", "Español"]) {
      expect(await screen.findByRole("menuitem", { name })).toBeInTheDocument();
    }
  });

  it("marks each option with its own language for screen readers", async () => {
    render(<LanguageMenu />);
    await open();
    expect(await screen.findByRole("menuitem", { name: "Deutsch" })).toHaveAttribute("lang", "de");
  });

  it("remembers a choice in the cookie and re-renders the page", async () => {
    render(<LanguageMenu />);
    const user = await open();
    await user.click(await screen.findByRole("menuitem", { name: "Italiano" }));
    expect(document.cookie).toContain("flatpare_locale=it");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("signed out, saves nothing to an account", async () => {
    render(<LanguageMenu />);
    const user = await open();
    await user.click(await screen.findByRole("menuitem", { name: "Deutsch" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("signed in, also saves the choice on the account", async () => {
    render(<LanguageMenu signedIn />);
    const user = await open();
    await user.click(await screen.findByRole("menuitem", { name: "Español" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/account/locale");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ locale: "es" });
  });

  it("does nothing when the current language is chosen again", async () => {
    render(<LanguageMenu signedIn />);
    const user = await open();
    await user.click(await screen.findByRole("menuitem", { name: "English" }));
    expect(refresh).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("names the current language in the active locale's words", async () => {
    setTestLocale("de");
    render(<LanguageMenu />);
    expect(screen.getByRole("button", { name: /Deutsch/ })).toBeInTheDocument();
  });

  // The globe alone, not the code beside it, and not a flag (#407).
  it("shows only the globe; the language is in the button's name", () => {
    setTestLocale("de");
    render(<LanguageMenu />);
    expect(screen.getByRole("button", { name: /Deutsch/ })).toHaveTextContent("");
  });
});
