import { Archivo, Caveat, IBM_Plex_Mono } from "next/font/google";

// The landing page's three typefaces (#301): Archivo for text (900 for
// headings), IBM Plex Mono for labels and code, Caveat for the handwriting on
// the hero sketch. Loaded here, not in the root layout, so the signed-in app
// does not download them. A module of its own so tests can stub it —
// next/font only works under the Next compiler.
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});
const caveat = Caveat({ subsets: ["latin"], weight: ["700"], variable: "--font-caveat" });

export const landingFontVariables = `${archivo.variable} ${plexMono.variable} ${caveat.variable}`;
