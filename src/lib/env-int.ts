// The "unset means unlimited" env parse, shared by every ceiling this app
// reads (E4's PROCESS_RATE_LIMIT_PER_HOUR, E5's MAX_MEMBERS and
// MAX_APARTMENTS). Unset is always the self-hoster's default and must always
// mean "no restriction" — `docker compose up` has to work with no
// configuration at all, and a self-hoster spends their own resources.
//
// Deliberately strict about what it accepts: Number(" 1.5 ") and
// Number("1e3") both produce something, and silently accepting them would
// make the ceiling in force differ from the one the operator wrote. Failing
// loudly at first use is the lesser surprise.
//
// Zero imports, so any layer can read a limit.
export class EnvConfigError extends Error {
  constructor(name: string, raw: string) {
    super(
      `${name} must be a positive integer or unset, got "${raw}". ` +
        "Unset (or empty) means unlimited, which is the self-hosted default."
    );
    this.name = "EnvConfigError";
  }
}

export function readOptionalPositiveInt(name: string): number | null {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return null;
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) throw new EnvConfigError(name, raw);
  return Number(trimmed);
}
