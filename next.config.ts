import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { parseLatestRelease } from "./src/lib/release";
import { copyMaplibreWorker } from "./src/lib/map/copy-worker";
import { presentExtracts } from "./src/lib/map/extract-files";
import { MAP_DATA_DIR } from "./src/lib/map/extracts";
import { FONTS_DIR } from "./src/lib/map/glyphs";

// The newest release, read from CHANGELOG.md once at build time and inlined
// as env vars for the landing page's release notice (#301). Unreadable or
// unparsable means no notice, never a failed build.
function latestRelease() {
  try {
    return parseLatestRelease(readFileSync("CHANGELOG.md", "utf8"));
  } catch {
    return null;
  }
}
const release = latestRelease();

// The map page's MapLibre worker, served from public/maplibre/ (#330). Done
// here because this file runs for every next dev / build / start, so the
// worker always matches the installed package. See src/lib/map/worker.ts.
copyMaplibreWorker("node_modules/maplibre-gl", "public");

// Which self-hosted country files are in public/map-data/ (#339), put there
// by scripts/fetch-map-data.ts. Inlined so the map knows which to read; a
// country without its file falls back to OpenFreeMap.
const mapExtracts = presentExtracts("public").join(",");

const nextConfig: NextConfig = {
  output: "standalone",
  // Bundle the drizzle/ migration SQL files with every serverless trace so
  // src/instrumentation.ts can apply them on Vercel cold starts.
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*"],
  },
  env: {
    FLATPARE_RELEASE_VERSION: release?.version ?? "",
    FLATPARE_RELEASE_DATE: release?.date ?? "",
    FLATPARE_MAP_EXTRACTS: mapExtracts,
  },
  async headers() {
    return [
      // Each country file's name carries its build date, and a refresh is a
      // new name, so a browser may keep what it has fetched.
      {
        source: `/${MAP_DATA_DIR}/:file*`,
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: `/${FONTS_DIR}/:path*`,
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
    ];
  },
};

// The interface language, resolved per request from a cookie, the account
// or Accept-Language — never from the URL (#288, src/i18n/request.ts).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
