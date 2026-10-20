import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema-auth";
import { UnauthorizedError } from "@/lib/household";

let signedIn = true;
vi.mock("@/lib/session", () => ({
  requireHousehold: vi.fn(async () => {
    if (!signedIn) throw new UnauthorizedError();
    return { householdId: 1, userId: "me", role: "member" };
  }),
}));

import { PUT } from "../locale/route";

const put = (body: unknown) =>
  PUT(new Request("http://localhost/api/account/locale", { method: "PUT", body: typeof body === "string" ? body : JSON.stringify(body) }));
const localeOf = async (id: string) => (await db.select({ locale: users.locale }).from(users).where(eq(users.id, id)))[0]?.locale;

beforeEach(async () => {
  signedIn = true;
  await db.delete(users);
  await db.insert(users).values({ id: "me", email: "me@example.com" });
  await db.insert(users).values({ id: "other", email: "other@example.com", locale: "es" });
});

describe("PUT /api/account/locale (#288)", () => {
  it("saves the caller's language and only theirs", async () => {
    const res = await put({ locale: "fr" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ locale: "fr" });
    expect(await localeOf("me")).toBe("fr");
    expect(await localeOf("other")).toBe("es");
  });

  it("refuses a language outside the five", async () => {
    const res = await put({ locale: "pt" });
    expect(res.status).toBe(400);
    expect(await localeOf("me")).toBeNull();
  });

  it("refuses a body that is not JSON", async () => {
    expect((await put("not json")).status).toBe(400);
  });

  it("answers 401 when signed out", async () => {
    signedIn = false;
    expect((await put({ locale: "de" })).status).toBe(401);
  });
});
