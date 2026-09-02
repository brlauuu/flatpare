import type { MetadataRoute } from "next";

// Colours mirror --primary and --background in globals.css, converted from
// oklch to hex because the manifest spec only accepts CSS colour literals
// that browsers parse outside a stylesheet.
const THEME = "#00676f";
const BACKGROUND = "#f9fafb";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Flatpare",
    short_name: "Flatpare",
    description: "Collaborative apartment comparison tool",
    // "/" rather than "/apartments": the proxy sends an authenticated visitor
    // on to the list, and an unauthenticated one needs the login screen.
    start_url: "/",
    display: "standalone",
    background_color: BACKGROUND,
    theme_color: THEME,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android masks icons to a circle/squircle; this one keeps the mark
      // inside the safe zone so it isn't clipped.
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
