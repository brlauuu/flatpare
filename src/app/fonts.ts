import { Archivo, IBM_Plex_Mono } from "next/font/google";

// The app's two typefaces (#324), shared with the landing page: Archivo for
// text (900 for headings), IBM Plex Mono for numbers, codes and labels.
// A leaf of its own so the root layout stays readable and tests can mock
// next/font/google, which only runs under the Next compiler.
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

export const appFontVariables = `${archivo.variable} ${plexMono.variable}`;
