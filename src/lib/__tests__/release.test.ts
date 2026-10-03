import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isReleaseFresh, parseLatestRelease, RELEASE_NOTICE_DAYS } from "../release";

describe("parseLatestRelease", () => {
  it("takes the first version heading, skipping Unreleased", () => {
    const changelog = [
      "# Changelog",
      "",
      "## Unreleased",
      "",
      "- something",
      "",
      "## 0.4.0 — 2026-10-02",
      "",
      "## 0.3.0 — 2026-09-30",
    ].join("\n");
    expect(parseLatestRelease(changelog)).toEqual({ version: "0.4.0", date: "2026-10-02" });
  });

  it("accepts a plain hyphen or en dash and a leading v", () => {
    expect(parseLatestRelease("## v1.2.3 - 2026-01-05")).toEqual({ version: "1.2.3", date: "2026-01-05" });
    expect(parseLatestRelease("## 1.2.3 – 2026-01-05")).toEqual({ version: "1.2.3", date: "2026-01-05" });
  });

  it("returns null when there is no release heading", () => {
    expect(parseLatestRelease("# Changelog\n\n## Unreleased\n")).toBeNull();
  });

  // The real file is what the build reads; a heading format drift would
  // silently turn the notice off.
  it("parses the repository's CHANGELOG.md, matching package.json", () => {
    const changelog = fs.readFileSync(path.join(process.cwd(), "CHANGELOG.md"), "utf8");
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    expect(parseLatestRelease(changelog)?.version).toBe(pkg.version);
  });
});

describe("isReleaseFresh", () => {
  const at = (iso: string) => new Date(iso);

  it("is fresh on the release day", () => {
    expect(isReleaseFresh("2026-10-02", at("2026-10-02T18:00:00Z"))).toBe(true);
  });

  it(`is fresh on day ${RELEASE_NOTICE_DAYS} and not after`, () => {
    expect(isReleaseFresh("2026-09-01", at("2026-10-01T00:00:00Z"))).toBe(true);
    expect(isReleaseFresh("2026-09-01", at("2026-10-01T00:00:01Z"))).toBe(false);
  });

  it("is not fresh for a future date or garbage", () => {
    expect(isReleaseFresh("2026-12-01", at("2026-10-02T00:00:00Z"))).toBe(false);
    expect(isReleaseFresh("", at("2026-10-02T00:00:00Z"))).toBe(false);
    expect(isReleaseFresh("not-a-date", at("2026-10-02T00:00:00Z"))).toBe(false);
  });
});
