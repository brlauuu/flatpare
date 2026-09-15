import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// #254 asked for a deliberate decision on the files reporting 0% because they
// are stubbed elsewhere. For these two the honest answer was neither
// "exclude" nor "accept 0%" — they are six and eight lines, so testing them
// costs less than the argument about whether to count them.
//
// Both are pass-throughs whose entire job is the props they hand down. That
// is exactly what is asserted: not that they render, but that they configure
// the thing underneath correctly, since a wrong prop here is silent.

const nextThemesProps = vi.fn();
vi.mock("next-themes", () => ({
  ThemeProvider: (props: Record<string, unknown>) => {
    nextThemesProps(props);
    return <div data-testid="next-themes">{props.children as React.ReactNode}</div>;
  },
}));

const readEncryptionMode = vi.fn();
vi.mock("@/lib/encryption-mode", () => ({
  readEncryptionMode: () => readEncryptionMode(),
}));

const cryptoProviderProps = vi.fn();
vi.mock("../crypto/crypto-provider", () => ({
  CryptoProvider: (props: { mode: string; children: React.ReactNode }) => {
    cryptoProviderProps(props);
    return <div data-testid="crypto-provider">{props.children}</div>;
  },
}));

import { ThemeProvider } from "../theme-provider";
import { CryptoGate } from "../crypto/crypto-gate";

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  readEncryptionMode.mockReturnValue("on");
});

describe("ThemeProvider", () => {
  it("renders its children", () => {
    render(
      <ThemeProvider>
        <span data-testid="child" />
      </ThemeProvider>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("configures next-themes for class-based system theming", () => {
    render(
      <ThemeProvider>
        <span />
      </ThemeProvider>
    );
    // `attribute="class"` is what Tailwind's dark: variant keys off, and
    // AGENTS.md ties theme_color in the manifest to these same tokens — a
    // change here is a visual change, not a refactor.
    expect(nextThemesProps).toHaveBeenCalledWith(
      expect.objectContaining({
        attribute: "class",
        defaultTheme: "system",
        enableSystem: true,
        disableTransitionOnChange: true,
      })
    );
  });
});

describe("CryptoGate", () => {
  it("passes the server-read encryption mode down to CryptoProvider", () => {
    readEncryptionMode.mockReturnValue("on");
    render(
      <CryptoGate>
        <span data-testid="child" />
      </CryptoGate>
    );

    // The whole point of this component: the env var is read in a server
    // component so no env access ships to the client. If `mode` ever stops
    // coming from readEncryptionMode, that guarantee is gone.
    expect(cryptoProviderProps).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "on" })
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("passes 'off' through rather than defaulting to on", () => {
    // A gate that silently upgraded off -> on would render key setup to a
    // deployment that deliberately runs unencrypted.
    readEncryptionMode.mockReturnValue("off");
    render(
      <CryptoGate>
        <span />
      </CryptoGate>
    );
    expect(cryptoProviderProps).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "off" })
    );
  });

  it("reads the mode per render rather than caching it at module load", () => {
    // Module-load caching would bake the first request's value into the
    // process for every later one.
    readEncryptionMode.mockReturnValue("on");
    render(
      <CryptoGate>
        <span />
      </CryptoGate>
    );
    cleanup();
    readEncryptionMode.mockReturnValue("off");
    render(
      <CryptoGate>
        <span />
      </CryptoGate>
    );

    expect(cryptoProviderProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: "off" })
    );
    expect(readEncryptionMode).toHaveBeenCalledTimes(2);
  });
});
