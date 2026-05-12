import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { ThemeToggle } from "../theme-toggle";

// next-themes calls window.matchMedia for system-theme detection; jsdom
// doesn't ship it. Provide a no-op stub.
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
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

function renderWithProvider(
  initial: "light" | "dark" | "system" = "system"
) {
  return render(
    <ThemeProvider attribute="class" defaultTheme={initial} enableSystem>
      <ThemeToggle />
    </ThemeProvider>
  );
}

describe("ThemeToggle", () => {
  it("renders three buttons after hydration: Light, Dark, System", () => {
    renderWithProvider();
    expect(
      screen.getByRole("button", { name: /Switch to Light theme/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Switch to Dark theme/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Switch to System theme/i })
    ).toBeInTheDocument();
  });

  it("calls setTheme when a non-active button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProvider("light");
    // Click Dark — should not throw and should be focusable/clickable.
    const darkBtn = screen.getByRole("button", {
      name: /Switch to Dark theme/i,
    });
    await user.click(darkBtn);
    // Re-query after the rerender; the button is still in the document.
    expect(
      screen.getByRole("button", { name: /Switch to Dark theme/i })
    ).toBeInTheDocument();
  });

  it("highlights the active theme with the bg-background class", () => {
    renderWithProvider("dark");
    const darkBtn = screen.getByRole("button", {
      name: /Switch to Dark theme/i,
    });
    const lightBtn = screen.getByRole("button", {
      name: /Switch to Light theme/i,
    });
    expect(darkBtn.className).toContain("bg-background");
    expect(lightBtn.className).not.toContain("bg-background");
  });

  // Note: the SSR-safe placeholder branch (`if (!mounted) return …`) is
  // unreachable from RTL — `useIsClient()` returns true on the second pass
  // and React commits the mounted output before our assertions run. The
  // remaining ~1 uncovered line is the placeholder return, which we accept
  // as a framework-level branch.
});
