import { Caveat } from "next/font/google";

// The landing page's own typeface (#301): Caveat, for the handwriting on the
// hero sketch. Archivo and IBM Plex Mono moved to the root layout in #324,
// so the whole app shares them; this one stays here so the signed-in app
// does not download it. A module of its own so tests can stub it —
// next/font only works under the Next compiler.
const caveat = Caveat({ subsets: ["latin"], weight: ["700"], variable: "--font-caveat" });

export const landingFontVariables = caveat.variable;
