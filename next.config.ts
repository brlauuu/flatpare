import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { parseLatestRelease } from "./src/lib/release";
import { copyMaplibreWorker } from "./src/lib/map/copy-worker";

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
  },
};

// The interface language, resolved per request from a cookie, the account
// or Accept-Language — never from the URL (#288, src/i18n/request.ts).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
