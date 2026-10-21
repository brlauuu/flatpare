// Retries a database transaction that failed with SQLITE_BUSY (#225).
//
// Each libSQL transaction on a local file borrows its own connection and
// starts with BEGIN IMMEDIATE, so a second concurrent transaction is refused
// with SQLITE_BUSY at once. SQLite's own busy timeout (the client's `timeout`
// option) does NOT help here, which was measured: the driver is synchronous,
// so its busy wait blocks the one Node thread, the transaction holding the lock
// cannot run its next statement or commit, and every waiter times out. 10
// concurrent creates with a 5s timeout: 1 succeeded, 9 failed after 45s.
//
// Waiting with setTimeout yields the thread instead, so the holder finishes
// and the retry gets the lock. Retrying the whole transaction is safe because
// drizzle rolls back on every failure, including a failed COMMIT; the
// transaction bodies touch the database only, never email or the network.
//
// A leaf: no app imports.

export const BUSY_RETRY_DEADLINE_MS = 3000;
const FIRST_DELAY_MS = 2;
const MAX_DELAY_MS = 50;

export function isBusyError(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && depth < 5; depth++) {
    if (typeof e !== "object") return false;
    const code = (e as { code?: unknown }).code;
    if (code === "SQLITE_BUSY" || code === "SQLITE_LOCKED") return true;
    const message = (e as { message?: unknown }).message;
    if (typeof message === "string" && message.startsWith("SQLITE_BUSY")) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

export async function retryOnBusy<T>(
  run: () => Promise<T>,
  deadlineMs: number = BUSY_RETRY_DEADLINE_MS
): Promise<T> {
  const giveUpAt = Date.now() + deadlineMs;
  let delay = FIRST_DELAY_MS;
  for (;;) {
    try {
      return await run();
    } catch (err) {
      if (!isBusyError(err) || Date.now() >= giveUpAt) throw err;
    }
    // Full jitter, so callers that collided once do not collide again in step.
    await new Promise((resolve) => setTimeout(resolve, Math.random() * delay));
    delay = Math.min(delay * 2, MAX_DELAY_MS);
  }
}
