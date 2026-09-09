import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";
import { resolveDbTarget } from "./target";

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
