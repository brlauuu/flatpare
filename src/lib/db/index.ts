import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

const isCloud = !!process.env.TURSO_DATABASE_URL;

// LOCAL_DB_URL lets tests point at a separate sqlite file so they don't
// trample the dev DB. Falls back to the default local file otherwise.
const localUrl = process.env.LOCAL_DB_URL ?? "file:./data/flatpare.db";

const client = createClient(
  isCloud
    ? {
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN,
      }
    : {
        url: localUrl,
      }
);

export const db = drizzle(client, { schema });
