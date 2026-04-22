import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Bundle the drizzle/ migration SQL files with every serverless trace so
  // src/instrumentation.ts can apply them on Vercel cold starts.
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*"],
  },
};

export default nextConfig;
