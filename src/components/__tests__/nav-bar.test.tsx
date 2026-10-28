import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/apartments",
  useRouter: () => ({ refresh: refreshMock }),
}));

const signOutMock = vi.fn();
vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

const clearKeysMock = vi.fn(async () => {});
vi.mock("@/lib/crypto", () => ({
  clearKeys: () => clearKeysMock(),
}));

const order: string[] = [];
vi.mock("@/lib/share-stash", () => ({
  clearShares: async () => {
    order.push("clearShares");
  },
}));

let installState = "none";
const promptInstallMock = vi.fn(async () => {});
vi.mock("@/components/install/install-prompt", () => ({
  useInstallState: () => installState,
  promptInstall: () => promptInstallMock(),
}));

import { NavBar, shortName } from "../nav-bar";
import { setUnsavedRating } from "@/lib/unsaved-changes";

beforeEach(() => {
  signOutMock.mockReset();
  signOutMock.mockResolvedValue(undefined);
  clearKeysMock.mockClear();
  order.length = 0;
  installState = "none";
  promptInstallMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NavBar user menu", () => {
  it("shows the signed-in user's name", () => {
    render(<NavBar userName="Alice" />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  // #407: a long name used to wrap the nav bar onto two lines.
  it("shows a long name cut to seven characters, the whole name on hover", () => {
    render(<NavBar userName="Đorđe Relić" />);
    const trigger = screen.getByRole("button", { name: /Đorđe R\.\.\./ });
    expect(trigger).toHaveAttribute("title", "Đorđe Relić");
    expect(screen.queryByText("Đorđe Relić")).toBeNull();
  });

  it("phone bar: icons only, each still named for a screen reader (#404)", () => {
    render(<NavBar userName="Alice" />);
    const navs = screen.getAllByRole("navigation");
    const phone = navs[navs.length - 1];
    for (const link of Array.from(phone.querySelectorAll("a"))) {
      expect(link.querySelector("svg")).not.toBeNull();
      expect(link.querySelector(".sr-only")?.textContent).toBeTruthy();
    }
  });

  it("signs out when 'Sign out' is clicked", async () => {
    const user = userEvent.setup();
    render(<NavBar userName="Alice" />);

    await user.click(screen.getByRole("button", { name: /Alice/i }));
    await user.click(await screen.findByText("Sign out"));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/" });
    });
    expect(clearKeysMock).toHaveBeenCalledTimes(1);
  });

  it("clears stashed shares before signing out", async () => {
    signOutMock.mockImplementation(async () => {
      order.push("signOut");
    });
    const user = userEvent.setup();
    render(<NavBar userName="Alice" />);
    await user.click(screen.getByRole("button", { name: /Alice/i }));
    await user.click(await screen.findByText("Sign out"));
    await waitFor(() => expect(order).toEqual(["clearShares", "signOut"]));
  });

  it("confirms before signing out when there is an unsaved rating", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    setUnsavedRating(true);

    const user = userEvent.setup();
    render(<NavBar userName="Alice" />);

    await user.click(screen.getByRole("button", { name: /Alice/i }));
    await user.click(await screen.findByText("Sign out"));

    expect(confirmSpy).toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();

    setUnsavedRating(false);
  });
});

describe("NavBar sections", () => {
  it("links every section, Household included (#298)", () => {
    render(<NavBar userName="Alice" />);
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"))
      .filter((h): h is string => h !== null);
    for (const href of ["/apartments", "/apartments/new", "/compare", "/map", "/household", "/settings"]) {
      expect(hrefs).toContain(href);
    }
  });

  it("keeps Guide in the user menu, not the bar, so the phone bar fits six items (#330)", async () => {
    const user = userEvent.setup();
    render(<NavBar userName="Alice" />);
    expect(screen.queryByRole("link", { name: "Guide" })).toBeNull();

    await user.click(screen.getByRole("button", { name: /Alice/i }));
    const guide = await screen.findByRole("menuitem", { name: "Guide" });
    expect(guide).toHaveAttribute("href", "/guide");
  });
});

// #190: the item shows only where installing is possible and not yet done.
describe("NavBar install item", () => {
  async function openMenu() {
    const user = userEvent.setup();
    render(<NavBar userName="Alice" />);
    await user.click(screen.getByRole("button", { name: /Alice/i }));
    await screen.findByRole("menuitem", { name: "Guide" });
    return user;
  }

  it.each(["none", "installed"])("is absent when the state is %s", async (state) => {
    installState = state;
    await openMenu();
    expect(screen.queryByRole("menuitem", { name: "Install app" })).toBeNull();
  });

  it("shows the browser's prompt where there is one", async () => {
    installState = "prompt";
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Install app" }));
    expect(promptInstallMock).toHaveBeenCalledTimes(1);
  });

  it("explains Add to Home Screen on an iPhone", async () => {
    installState = "ios";
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Install app" }));
    expect(await screen.findByRole("dialog", { name: "Add Flatpare to your Home Screen" })).toBeInTheDocument();
    expect(screen.getByText(/Choose "Add to Home Screen"/)).toBeInTheDocument();
    expect(promptInstallMock).not.toHaveBeenCalled();
  });
});

describe("NavBar current section", () => {
  // The mocked pathname is /apartments. The current section is a filled
  // block (#324); aria-current is what says so to a screen reader, and what
  // the styling keys off. Both navs (desktop and mobile) carry it.
  it("marks the current section with aria-current in both navs", () => {
    render(<NavBar userName="Alice" />);
    const current = screen.getAllByRole("link", { name: "Apartments" });
    expect(current).toHaveLength(2);
    for (const link of current) expect(link.getAttribute("aria-current")).toBe("page");
    for (const link of screen.getAllByRole("link", { name: "Compare" })) {
      expect(link.hasAttribute("aria-current")).toBe(false);
    }
  });
});

describe("NavBar in print", () => {
  // The recovery kit is printed (#324): the page header has no place on it.
  it("is hidden when printed", () => {
    render(<NavBar userName="Alice" />);
    expect(document.querySelector("header")!.className).toContain("print:hidden");
  });
});

// The landing page's blue/yellow wordmark, not an inverted black one (#323).
describe("NavBar logo", () => {
  it("shows one logo per theme", () => {
    render(<NavBar userName="Alice" />);
    const sources = screen.getAllByRole("img", { name: "Flatpare" }).map((img) => img.getAttribute("src") ?? "");
    expect(sources).toHaveLength(2);
    expect(sources.some((src) => src.includes("flatpare_logo_blue.svg"))).toBe(true);
    expect(sources.some((src) => src.includes("flatpare_logo_yellow.svg"))).toBe(true);
  });
});

describe("shortName", () => {
  it("keeps up to seven characters as they are", () => {
    expect(shortName("Alice")).toBe("Alice");
    expect(shortName("Abcdefg")).toBe("Abcdefg");
  });

  it("cuts after seven characters, counting characters rather than code units", () => {
    expect(shortName("Abcdefgh")).toBe("Abcdefg...");
    expect(shortName("𝒜𝒜𝒜𝒜𝒜𝒜𝒜𝒜")).toBe("𝒜𝒜𝒜𝒜𝒜𝒜𝒜...");
  });
});
