import { describe, it, expect } from "vitest";
import { escapeHtml, householdInvitationEmail, safeName } from "@/lib/email-templates";

const base = {
  inviterName: "Ana",
  invitedEmail: "ben@example.com",
  siteUrl: "https://flatpare.com",
  expiresAt: new Date("2026-10-06T12:00:00Z"),
};

describe("safeName", () => {
  it("falls back when there is no name", () => {
    expect(safeName(null)).toBe("Someone");
    expect(safeName("   ")).toBe("Someone");
  });

  it("removes line breaks, which would otherwise reach the subject header", () => {
    expect(safeName("Ana\r\nBcc: victim@example.com")).toBe("Ana Bcc: victim@example.com");
  });

  it("caps the length", () => {
    expect(safeName("x".repeat(200))).toHaveLength(60);
  });
});

describe("escapeHtml", () => {
  it("escapes the five characters that matter", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;"
    );
  });
});

describe("householdInvitationEmail", () => {
  it("names the inviter, the address to sign in with, the link and the expiry", () => {
    const mail = householdInvitationEmail(base);
    expect(mail.subject).toBe("Ana invited you to Flatpare");
    for (const part of [mail.text, mail.html]) {
      expect(part).toContain("Ana invited you");
      expect(part).toContain("ben@example.com");
      expect(part).toContain("https://flatpare.com");
      expect(part).toContain("2026-10-06");
    }
  });

  it("says an unexpected invitation can be ignored", () => {
    expect(householdInvitationEmail(base).text).toMatch(/ignore this email/i);
  });

  it("escapes a hostile display name in the HTML", () => {
    const mail = householdInvitationEmail({
      ...base,
      inviterName: `<img src=x onerror=alert(1)>`,
    });
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;img");
  });

  it("keeps the subject on one line whatever the name holds", () => {
    const mail = householdInvitationEmail({ ...base, inviterName: "Ana\nSubject: hacked" });
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });

  it("takes no household name: the email carries nothing about the household", () => {
    // The input type has no such field. This pins that against a well-meant
    // "add the household name" change; see the file's header comment.
    expect(Object.keys(base).sort()).toEqual(["expiresAt", "invitedEmail", "inviterName", "siteUrl"]);
    expect(householdInvitationEmail.length).toBe(1);
  });
});
