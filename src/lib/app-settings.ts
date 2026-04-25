import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";

export const DEFAULT_STATION_ADDRESS = "Basel SBB, Switzerland";

const STATION_ADDRESS_KEY = "station_address";

export async function getStationAddress(): Promise<string> {
  const row = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, STATION_ADDRESS_KEY))
    .limit(1);
  return row[0]?.value ?? DEFAULT_STATION_ADDRESS;
}

export async function setStationAddress(value: string): Promise<void> {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new Error("Station address cannot be empty");
  }
  await db
    .insert(appSettings)
    .values({ key: STATION_ADDRESS_KEY, value: trimmed })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: trimmed, updatedAt: new Date() },
    });
}
