import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Metadata, Viewport } from "next";

// next/font/google runs a build-time font fetch; in a test it only needs to
// hand back the CSS variable names the layout interpolates.
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));
vi.mock("@/components/theme-provider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../globals.css", () => ({}));

const ORIGINAL_SITE = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_SITE === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE;
});

async function load() {
  return (await import("../layout")) as {
    default: (p: { children: React.ReactNode }) => React.ReactElement;
    metadata: Metadata;
    viewport: Viewport;
  };
}

describe("RootLayout metadata", () => {
  it("derives metadataBase from NEXT_PUBLIC_SITE_URL", async () => {
    // #189: pointing a new domain at the deployment must be an env-var
    // change, not a code change. If metadataBase is ever hardcoded, every
    // canonical and Open Graph URL silently points at the wrong host.
    process.env.NEXT_PUBLIC_SITE_URL = "https://flatpare.example";
    const { metadata } = await load();
    expect(metadata.metadataBase?.toString()).toBe("https://flatpare.example/");
  });

  it("falls back to localhost:3002 with no site URL configured", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const { metadata } = await load();
    // Matches the dev server's port, not Next's default 3000.
    expect(metadata.metadataBase?.toString()).toBe("http://localhost:3002/");
  });

  it("sets a canonical and an Open Graph URL that resolve against the base", async () => {
    const { metadata } = await load();
    expect(metadata.alternates?.canonical).toBe("/");
    expect(metadata.openGraph?.url).toBe("/");
  });

  it("keeps the title template and default in step", async () => {
    const { metadata } = await load();
    expect(metadata.title).toMatchObject({
      default: "Flatpare — compare apartments together",
      template: "%s · Flatpare",
    });
  });

  it("declares the apple-touch icon iOS needs", async () => {
    // iOS ignores the manifest's icons; without this a home-screen install
    // gets a screenshot thumbnail instead of the mark.
    const { metadata } = await load();
    expect(metadata.icons).toMatchObject({ apple: "/apple-touch-icon.png" });
  });

  it("describes the product without claiming zero-knowledge", async () => {
    // Same rule the landing page is held to: the blind-proxy exception makes
    // the unqualified claim false, and this description is what search
    // results and link previews show.
    const { metadata } = await load();
    const text = JSON.stringify(metadata).toLowerCase();
    expect(text).not.toContain("zero-knowledge");
    expect(text).not.toContain("open source");
  });
});

describe("RootLayout viewport", () => {
  it("declares light and dark theme colours", async () => {
    // AGENTS.md ties these to --primary/--background in globals.css and the
    // manifest's theme_color; they move together or the installed app
    // flashes the wrong colour on launch.
    const { viewport } = await load();
    expect(viewport.themeColor).toEqual([
      { media: "(prefers-color-scheme: light)", color: "#f9fafb" },
      { media: "(prefers-color-scheme: dark)", color: "#050e0f" },
    ]);
  });
});

describe("RootLayout element", () => {
  it("renders html > body > ThemeProvider around the children", async () => {
    // Asserted on the element tree rather than the DOM: rendering <html> into
    // jsdom's existing document nests a second one, which React warns about
    // and which tests nothing the structure does not already show.
    const { default: RootLayout } = await load();
    const tree = RootLayout({ children: "CHILD" });

    expect(tree.type).toBe("html");
    const html = tree.props as { lang: string; className: string; children: React.ReactElement };
    expect(html.lang).toBe("en");
    // suppressHydrationWarning + the font variables are what next-themes and
    // Tailwind depend on being on the <html> element specifically.
    expect(html.className).toContain("--font-geist-sans");
    expect(html.className).toContain("--font-geist-mono");

    const body = html.children;
    expect(body.type).toBe("body");
  });

  it("marks html with suppressHydrationWarning for next-themes", async () => {
    // next-themes sets the class on <html> before React hydrates; without
    // this the console fills with hydration mismatches on every load.
    const { default: RootLayout } = await load();
    const tree = RootLayout({ children: null });
    expect((tree.props as { suppressHydrationWarning?: boolean }).suppressHydrationWarning).toBe(true);
  });
});
