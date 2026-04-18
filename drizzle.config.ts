import type { Config } from "drizzle-kit";

const isCloud = !!process.env.TURSO_DATABASE_URL;

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: isCloud ? "turso" : "sqlite",
  dbCredentials: isCloud
    ? {
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN,
      }
    : {
        url: "file:./data/flatpare.db",
      },
} satisfies Config;
