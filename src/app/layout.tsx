import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
    { media: "(prefers-color-scheme: light)", color: "#f9fafb" },
    { media: "(prefers-color-scheme: dark)", color: "#050e0f" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
