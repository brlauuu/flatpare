// libsql reports a unique/primary-key clash as a plain Error, but Drizzle
// wraps it in a DrizzleQueryError whose own .message is just the failed query
// text — the constraint message lives on .cause. Walk the cause chain rather
// than matching only the top-level message. Bounded, since .cause is
// `unknown` input and a self-referencing chain would otherwise spin forever —
// a handful of links is far more than Drizzle's own wrapping ever produces.
//
// This module deliberately imports NOTHING. It is used by `src/auth.ts`
// (the credentials provider's insert-or-select) as well as by the route
// layer, and `src/auth.ts` cannot import `@/lib/api-route`, which reaches
// back to `@/auth` through `@/lib/session`.
const MAX_CAUSE_CHAIN_DEPTH = 5;

export function isUniqueConstraintError(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; depth < MAX_CAUSE_CHAIN_DEPTH && cur instanceof Error; depth++) {
    if (/unique constraint/i.test(cur.message)) return true;
    cur = cur.cause;
  }
  return false;
}
