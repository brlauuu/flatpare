import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

const isCloud = !!process.env.TURSO_DATABASE_URL;

const client = createClient(
  isCloud
    ? {
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN,
      }
    : {
        url: "file:./data/flatpare.db",
      }
);

export const db = drizzle(client, { schema });
