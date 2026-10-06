import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { ThemeToggle } from "../theme-toggle";

// next-themes calls window.matchMedia for system-theme detection; jsdom
// doesn't ship it. The stub answers the dark-scheme query with `systemDark`.
let systemDark = false;

beforeEach(() => {
  systemDark = false;
  window.localStorage.clear();
  document.documentElement.className = "";
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query.includes("dark") && systemDark,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => cleanup());

// The same provider settings as src/components/theme-provider.tsx.
function renderToggle(className?: string) {
  return render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ThemeToggle className={className} />
    </ThemeProvider>
  );
}

describe("ThemeToggle", () => {
  it("follows a light system preference until pressed", () => {
    renderToggle();
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
  });

  it("follows a dark system preference until pressed", () => {
    systemDark = true;
    renderToggle();
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });

  it("is one button that flips light and dark, with no separate System choice", async () => {
    const user = userEvent.setup();
    renderToggle();
    expect(screen.getAllByRole("button")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem("theme")).toBe("dark");

    await user.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(document.documentElement).toHaveClass("light");
    expect(window.localStorage.getItem("theme")).toBe("light");
  });

  // The landing page keeps its yellow edge in dark mode this way.
  it("lets a caller replace the edge colour", () => {
    renderToggle("border-(--lp-chip-line)");
    const button = screen.getByRole("button");
    expect(button).toHaveClass("border-(--lp-chip-line)");
    expect(button).not.toHaveClass("border-frame");
  });
});
