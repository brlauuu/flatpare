import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema-auth";
import { readAccountLocale, saveAccountLocale } from "../account-locale";

beforeEach(async () => {
  await db.delete(users);
  await db.insert(users).values({ id: "me", email: "me@example.com" });
  await db.insert(users).values({ id: "other", email: "other@example.com", locale: "it" });
});

describe("the account's interface language (#288)", () => {
  it("is unset until chosen", async () => {
    expect(await readAccountLocale("me")).toBeNull();
  });

  it("saves the caller's row only", async () => {
    await saveAccountLocale("me", "de");
    expect(await readAccountLocale("me")).toBe("de");
    expect(await readAccountLocale("other")).toBe("it");
  });

  // A locale a later release dropped must not reach the translator.
  it("reads a value it does not support as unset", async () => {
    await db.update(users).set({ locale: "pt" });
    expect(await readAccountLocale("me")).toBeNull();
  });

  it("reads a missing row as unset", async () => {
    expect(await readAccountLocale("nobody")).toBeNull();
  });
});
