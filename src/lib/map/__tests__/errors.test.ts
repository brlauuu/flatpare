import { describe, it, expect } from "vitest";
import { isFatalMapError } from "../errors";

describe("isFatalMapError", () => {
  it("a failed style or tile index before the first load means no map can be drawn", () => {
    expect(isFatalMapError({}, false)).toBe(true);
    expect(isFatalMapError({ sourceId: "omt" }, false)).toBe(true);
  });

  it("one failed tile is not fatal, even before the first load (a flaky phone connection)", () => {
    expect(isFatalMapError({ sourceId: "omt", tile: { tileID: "11/1068/715" } }, false)).toBe(false);
  });

  it("nothing after the first load replaces a map that already drew", () => {
    expect(isFatalMapError({}, true)).toBe(false);
  });
});
