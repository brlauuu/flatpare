import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import { parseLatestRelease } from "./src/lib/release";

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

export default nextConfig;
