import { Caveat } from "next/font/google";

// Caveat, for the handwriting on the map's marks (#330). The landing page
// loads its own copy (landing-fonts.ts); next/font serves both from one
// file. A module of its own so tests can stub it — next/font only works
// under the Next compiler.
const caveat = Caveat({ subsets: ["latin"], weight: ["700"], variable: "--font-caveat" });

export const mapFontVariables = caveat.variable;
