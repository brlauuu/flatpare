// The landing page's "New release" notice (#301).
//
// A LEAF with no imports: next.config.ts calls parseLatestRelease at build
// time and hands the result to the app as env vars, so it must not reach
// into anything that needs the app's module graph.
//
// The source is CHANGELOG.md, whose first version heading is the newest
// release ("## 0.4.0 — 2026-10-02"). package.json carries the same version
// but no date, and the notice needs the date: it is shown only while the
// release is at most RELEASE_NOTICE_DAYS old. Reading it at build time means
// no GitHub API call from the page, and a deploy from a tag always describes
// exactly what it contains.

export const RELEASE_NOTICE_DAYS = 30;

export interface ReleaseInfo {
  version: string;
  // ISO date, YYYY-MM-DD.
  date: string;
}

const HEADING = /^##\s+v?(\d+\.\d+\.\d+)\s+[—–-]\s+(\d{4}-\d{2}-\d{2})\s*$/m;

export function parseLatestRelease(changelog: string): ReleaseInfo | null {
  const match = HEADING.exec(changelog);
  return match ? { version: match[1], date: match[2] } : null;
}

// True from the release day through RELEASE_NOTICE_DAYS later. A date in the
// future (a clock or a typo) or one that does not parse shows nothing.
export function isReleaseFresh(date: string, now: Date): boolean {
  const released = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(released)) return false;
  const days = (now.getTime() - released) / 86_400_000;
  return days >= 0 && days <= RELEASE_NOTICE_DAYS;
}
