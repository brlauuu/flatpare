import { describe, it, expect, vi, afterEach } from "vitest";
import type { MapSource } from "@/lib/map/local-map";

const client = vi.fn((props: { source: MapSource }) => props);
vi.mock("../map-page-client", () => ({ MapPageClient: (props: { source: MapSource }) => client(props) }));
vi.mock("@/lib/map/map-config", () => ({ readMapSource: () => ({ mode: "local", file: null, problem: "missing" }) }));

import MapPage, { dynamic } from "../page";

afterEach(() => client.mockClear());

describe("Map page (server)", () => {
  it("reads the map choice on the server and hands it to the page (#339)", () => {
    const el = MapPage();
    expect(el.props).toEqual({ source: { mode: "local", file: null, problem: "missing" } });
    expect(dynamic).toBe("force-dynamic");
  });
});
