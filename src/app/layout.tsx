import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { ThemeProvider } from "@/components/theme-provider";
import { SITE_URL } from "@/lib/site";
import { appFontVariables } from "./fonts";
import "./globals.css";

// The title and descriptions in the reader's language (#288); the rest is
// fixed. Same URLs in every language, so the canonical stays "/".
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing.meta");
  const title = t("title");
  const description = t("description");
  return {
    // metadataBase resolves the relative URLs below into absolute ones for
    // Open Graph. Driven by NEXT_PUBLIC_SITE_URL so registering the domain and
    // pointing it at Vercel needs no code change (#189).
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      template: "%s · Flatpare",
    },
    description,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      siteName: "Flatpare",
      title,
      description,
      url: "/",
    },
    twitter: {
      card: "summary",
      title,
      description,
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
}

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
  // German. next-intl's locale is already the regional tag: de-CH, fr-CH.
  const locale = await getLocale();
  return (
    <html
      lang={locale}
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
