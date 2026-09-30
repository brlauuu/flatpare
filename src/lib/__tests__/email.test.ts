import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { emailEnabled, emailFrom, sendEmail } from "@/lib/email";

const MESSAGE = {
  to: "ana@example.com",
  subject: "Secret subject",
  text: "plain body",
  html: "<p>html body</p>",
  idempotencyKey: "household-invitation/7",
};

const fetchMock = vi.fn();
let logged: string[];

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("RESEND_EMAIL_DOMAIN", "");
  vi.stubEnv("EMAIL_FROM", "");
  vi.stubEnv("EMAIL_REPLY_TO", "");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ok = () => new Response(JSON.stringify({ id: "e_1" }), { status: 200 });

describe("emailEnabled", () => {
  it("is off with nothing set — the self-hoster default", () => {
    expect(emailEnabled()).toBe(false);
  });

  it("is off with a key but no sender, since nothing could be sent", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    expect(emailEnabled()).toBe(false);
  });

  it("is off when the key is only whitespace", () => {
    vi.stubEnv("RESEND_API_KEY", "   ");
    vi.stubEnv("EMAIL_FROM", "Flatpare <hello@flatpare.com>");
    expect(emailEnabled()).toBe(false);
  });

  it("is on with a key and a sender", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_EMAIL_DOMAIN", "mail.flatpare.com");
    expect(emailEnabled()).toBe(true);
  });
});

describe("emailFrom", () => {
  it("builds the sender from the domain the integration verified", () => {
    vi.stubEnv("RESEND_EMAIL_DOMAIN", "mail.flatpare.com");
    expect(emailFrom()).toBe("Flatpare <hello@mail.flatpare.com>");
  });

  it("lets EMAIL_FROM override it, so the address is configuration", () => {
    vi.stubEnv("RESEND_EMAIL_DOMAIN", "mail.flatpare.com");
    vi.stubEnv("EMAIL_FROM", "Flatpare <hello@flatpare.com>");
    expect(emailFrom()).toBe("Flatpare <hello@flatpare.com>");
  });
});

describe("sendEmail", () => {
  it("makes no request when email is off", async () => {
    expect(await sendEmail(MESSAGE)).toEqual({ sent: false, reason: "off" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("when configured", () => {
    beforeEach(() => {
      vi.stubEnv("RESEND_API_KEY", "re_test_key");
      vi.stubEnv("EMAIL_FROM", "Flatpare <hello@flatpare.com>");
    });

    it("posts the message with the key and the idempotency key", async () => {
      fetchMock.mockResolvedValue(ok());
      expect(await sendEmail(MESSAGE)).toEqual({ sent: true });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.resend.com/emails");
      const headers = init.headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer re_test_key");
      expect(headers["idempotency-key"]).toBe("household-invitation/7");
      expect(JSON.parse(String(init.body))).toEqual({
        from: "Flatpare <hello@flatpare.com>",
        to: ["ana@example.com"],
        subject: "Secret subject",
        text: "plain body",
        html: "<p>html body</p>",
      });
    });

    it("adds a reply-to only when one is configured", async () => {
      vi.stubEnv("EMAIL_REPLY_TO", "owner@example.com");
      fetchMock.mockResolvedValue(ok());
      await sendEmail(MESSAGE);
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body)).reply_to).toEqual(["owner@example.com"]);
    });

    it("reports a refusal without throwing", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ message: "domain not verified for ana@example.com" }), {
          status: 403,
        })
      );
      expect(await sendEmail(MESSAGE)).toEqual({ sent: false, reason: "failed" });
    });

    it("reports a network failure without throwing", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed: ana@example.com"));
      expect(await sendEmail(MESSAGE)).toEqual({ sent: false, reason: "failed" });
    });

    it("never logs the recipient, the subject, the key or the provider's message", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "rejected ana@example.com" }), { status: 422 })
      );
      await sendEmail(MESSAGE);
      fetchMock.mockRejectedValueOnce(new TypeError("fetch failed for ana@example.com"));
      await sendEmail(MESSAGE);

      expect(logged).toHaveLength(2);
      const all = logged.join("\n");
      expect(all).toContain("status=422");
      expect(all).toContain("TypeError");
      for (const secret of ["ana@example.com", "Secret subject", "re_test_key", "rejected", "fetch failed"]) {
        expect(all).not.toContain(secret);
      }
    });
  });
});
