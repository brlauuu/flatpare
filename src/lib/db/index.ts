import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";
import { resolveDbTarget } from "./target";
import { retryOnBusy } from "./busy-retry";

// Resolved through ./target so the connection opened here and the line
// logged at boot by src/instrumentation.ts come from the same value and
// cannot drift (#195).
const target = resolveDbTarget();

const client = createClient(
  target.kind === "cloud"
    ? { url: target.url, authToken: target.authToken }
    : { url: target.url }
);

export const db = drizzle(client, { schema });

// Concurrent transactions queue instead of failing with SQLITE_BUSY (#225).
// Wrapped here, once, so every db.transaction gets it, including the next one
// someone writes on a path that IS concurrent. See busy-retry.ts for why the
// client's busy timeout cannot do this.
const transaction = db.transaction.bind(db);
db.transaction = ((run, config) =>
  retryOnBusy(() => transaction(run, config))) as typeof db.transaction;
