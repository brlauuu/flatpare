import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema-auth";
import { isLocale, type Locale } from "./locales";

// The interface language saved on the account (#288), so a choice follows
// a person to a new device and an email sent to them uses it. Plaintext
// account data, like the display name: a preference, not household data.

// Null when unset, when the row is gone, or when the column holds something
// this release does not support (a locale dropped later reads as unset).
export async function readAccountLocale(userId: string): Promise<Locale | null> {
  const [row] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, userId));
  return isLocale(row?.locale) ? row.locale : null;
}

export async function saveAccountLocale(userId: string, locale: Locale): Promise<void> {
  await db.update(users).set({ locale }).where(eq(users.id, userId));
}
