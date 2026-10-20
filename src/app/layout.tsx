import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { ThemeProvider } from "@/components/theme-provider";
import { SITE_URL } from "@/lib/site";
import { REGIONAL_TAG } from "@/i18n/locales";
import { appFontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  // metadataBase resolves the relative URLs below into absolute ones for
  // Open Graph. Driven by NEXT_PUBLIC_SITE_URL so registering the domain and
  // pointing it at Vercel needs no code change (#189).
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Flatpare — compare apartments together",
    template: "%s · Flatpare",
  },
  description:
    "A shared workspace for two people hunting for a flat. Listings, ratings and notes are encrypted in your browser, with a key the server never holds.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Flatpare",
    title: "Flatpare — compare apartments together",
    description:
      "A shared workspace for two people hunting for a flat. Listings, ratings and notes are encrypted in your browser, with a key the server never holds.",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "Flatpare — compare apartments together",
    description:
      "A shared workspace for two people hunting for a flat. Listings, ratings and notes are encrypted in your browser, with a key the server never holds.",
  },
  icons: {
    icon: "/favicon.ico",
    // iOS ignores the web app manifest's icons and uses this instead; without
    // it a home-screen install gets a screenshot thumbnail.
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Flatpare",
    statusBarStyle: "default",
  },
};

// Paints the browser/status bar to match the app instead of flashing white
// when the installed app launches.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The interface language (#288), so a screen reader reads German as
  // German. The regional tag, not the bare language: de-CH, fr-CH, it-CH.
  const locale = await getLocale();
  return (
    <html
      lang={REGIONAL_TAG[locale]}
      className={`${appFontVariables} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
