// Where MapLibre's web worker is served from (#330). MapLibre finds its
// worker next to its own script by default, which breaks once Next bundles
// that script into a chunk, so the map points it here instead
// (`setWorkerUrl`). The file is copied from the installed package by
// next.config.ts (copy-worker.ts); the version in the name keeps a browser
// from pairing a cached old worker with a new main bundle.
export function workerUrl(version: string): string {
  return `/maplibre/maplibre-gl-worker-${version}.mjs`;
}
