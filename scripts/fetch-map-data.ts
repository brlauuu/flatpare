// Downloads the self-hosted map data (#339) into public/map-data/, verified
// against the hashes in src/lib/map/extracts.ts. Run by the Vercel build
// (scripts/vercel-build.mjs) and the Docker image; locally, `npm run
// map:fetch` once, or the map uses OpenFreeMap. Fails loudly: on the hosted
// deployment the landing page promises Swiss maps come from flatpare.com.
import { fetchExtracts } from "../src/lib/map/extract-files";

fetchExtracts("public", undefined, fetch, (line) => console.log(line)).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
