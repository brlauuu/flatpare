import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import { feedbackDays } from "@/lib/db/schema";
import { users } from "@/lib/db/schema-auth";
import { ApiError } from "@/lib/api-error";
import { FEEDBACK_PER_DAY } from "@/lib/feedback";

// #476: feedback is emailed to FEEDBACK_EMAIL and stored nowhere; anonymous
// feedback carries nothing that identifies the sender.

let member = true;
vi.mock("@/lib/api-route", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-route")>()),
  requireMember: vi.fn(async () => {
    if (!member) throw new ApiError("Not found", 404);
    return { householdId: 7, userId: "me", role: "member" };
  }),
}));
vi.mock("@/i18n/request", () => ({ resolveLocale: async () => "de" }));

import { POST } from "../route";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/feedback", { method: "POST", body: JSON.stringify(body) }));

let sent: Array<{ headers: Record<string, string>; body: Record<string, unknown> }>;
let resendStatus: number;
let logged: string[];

beforeEach(async () => {
  member = true;
  resendStatus = 200;
  sent = [];
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_FROM", "Flatpare <hello@example.com>");
  vi.stubEnv("FEEDBACK_EMAIL", "owner@example.com");
  vi.stubEnv("FLATPARE_RELEASE_VERSION", "0.33.0");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sent.push({ headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
      return new Response("{}", { status: resendStatus });
    })
  );
  await db.delete(feedbackDays);
  await db.delete(users);
  await db.insert(users).values({ id: "me", email: "lena@example.com", name: "Lena" });
  logged = [];
  for (const channel of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, channel).mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/feedback", () => {
  it("emails named feedback to the owner, with Reply-To the sender", async () => {
    const res = await post({ message: "The map <b>is</b> great", anonymous: false });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ emailed: "sent" });
    expect(sent).toHaveLength(1);
    const { body, headers } = sent[0];
    expect(body.to).toEqual(["owner@example.com"]);
    expect(body.reply_to).toEqual(["lena@example.com"]);
    expect(body.subject).toBe("Flatpare feedback");
    expect(body.text).toContain("The map <b>is</b> great");
    expect(body.text).toContain("From Lena <lena@example.com>");
    expect(body.text).toContain("Flatpare 0.33.0, interface language de.");
    expect(body.html).toContain("The map &lt;b&gt;is&lt;/b&gt; great");
    expect(headers["idempotency-key"]).toMatch(/^feedback\/[0-9a-f-]{36}$/);
  });

  it("sends anonymous feedback with nothing that names the sender", async () => {
    await post({ message: "Anonymous words", anonymous: true });
    const { body } = sent[0];
    const all = JSON.stringify(body);
    for (const trace of ["lena@example.com", "Lena", "\"me\"", "7"]) {
      expect(all.includes(trace), trace).toBe(false);
    }
    expect(body.reply_to).toBeUndefined();
    expect(body.subject).toBe("Flatpare feedback (anonymous)");
    expect(body.text).toContain("Sent anonymously.");
  });

  it("stores nothing but the day's count, and never logs the message", async () => {
    resendStatus = 500;
    const res = await post({ message: "secret words", anonymous: false });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ emailed: "failed" });
    expect(await db.select().from(feedbackDays)).toEqual([
      { day: new Date().toISOString().slice(0, 10), count: 1 },
    ]);
    expect(logged.join("\n")).not.toContain("secret");
  });

  it("caps the sends per day, site-wide", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await db.insert(feedbackDays).values({ day: today, count: FEEDBACK_PER_DAY - 1 });
    expect((await post({ message: "last one", anonymous: true })).status).toBe(200);
    const res = await post({ message: "one too many", anonymous: true });
    expect(res.status).toBe(429);
    expect(sent).toHaveLength(1);
  });

  it("refuses an empty or too long message without echoing it", async () => {
    expect((await post({ message: "   ", anonymous: false })).status).toBe(400);
    const res = await post({ message: `secret ${"x".repeat(4000)}`, anonymous: false });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
    expect(sent).toHaveLength(0);
  });

  it("is not there without FEEDBACK_EMAIL or without email", async () => {
    vi.stubEnv("FEEDBACK_EMAIL", "");
    expect((await post({ message: "hi", anonymous: false })).status).toBe(404);
    vi.stubEnv("FEEDBACK_EMAIL", "owner@example.com");
    vi.stubEnv("RESEND_API_KEY", "");
    expect((await post({ message: "hi", anonymous: false })).status).toBe(404);
    expect(sent).toHaveLength(0);
  });

  it("is for members only", async () => {
    member = false;
    expect((await post({ message: "hi", anonymous: false })).status).toBe(404);
    expect(sent).toHaveLength(0);
  });
});
