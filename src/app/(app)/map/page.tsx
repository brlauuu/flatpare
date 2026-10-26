import { readMapSource } from "@/lib/map/map-config";
import { MapPageClient } from "./map-page-client";

// The map choice is read here, on the server, on every request (#339): a
// self-hoster who adds or replaces the file in maps/ sees it on the next
// load, and the browser never reads an environment variable.
export const dynamic = "force-dynamic";

export default function MapPage() {
  return <MapPageClient source={readMapSource()} />;
}
