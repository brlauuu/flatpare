import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { emailLocale, emailText } from "../email-text";
import { LOCALES } from "../locales";
import { householdInvitationEmail, magicLinkEmail, memberRemovedEmail } from "@/lib/email-templates";

// The emails in five languages (#288).

describe("emailLocale", () => {
  it("takes the first supported language it is given", () => {
    expect(emailLocale("fr", "de")).toBe("fr");
    expect(emailLocale(null, undefined, "it")).toBe("it");
    expect(emailLocale("pt", "es")).toBe("es");
  });

  it("falls back to English", () => {
    expect(emailLocale()).toBe("en");
    expect(emailLocale(null, "klingon")).toBe("en");
  });
});

type Tree = { [key: string]: string | Tree };
const leaves = (tree: Tree, prefix = ""): [string, string][] =>
  Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "string" ? [[`${prefix}${k}`, v] as [string, string]] : leaves(v, `${prefix}${k}.`)
  );
const catalogue = (locale: string): Tree =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", locale, "emails.json"), "utf8"));

describe.each(LOCALES.filter((l) => l !== "en"))("the %s emails", (locale) => {
  // Every sentence is translated; short labels like "Flatpare" may match.
  it("leave no English sentence", () => {
    const english = new Map(leaves(catalogue("en")));
    for (const [key, message] of leaves(catalogue(locale))) {
      if ((english.get(key) ?? "").length < 20) continue;
      expect(message, `${locale}: emails.${key} is still English`).not.toBe(english.get(key));
    }
  });

  it("render in that language", () => {
    const t = emailText(locale);
    const english = emailText("en");
    const invite = {
      inviterName: "Ana",
      invitedEmail: "ben@example.com",
      siteUrl: "https://flatpare.com",
      expiresAt: new Date("2026-10-06T12:00:00Z"),
    };
    const mails = [
      [magicLinkEmail({ url: "https://flatpare.com/x", siteHost: "flatpare.com", minutes: 15, t }), magicLinkEmail({ url: "https://flatpare.com/x", siteHost: "flatpare.com", minutes: 15, t: english })],
      [memberRemovedEmail({ removerName: "Ana", siteUrl: "https://flatpare.com", t }), memberRemovedEmail({ removerName: "Ana", siteUrl: "https://flatpare.com", t: english })],
      [householdInvitationEmail({ ...invite, t }), householdInvitationEmail({ ...invite, t: english })],
    ];
    for (const [mail, inEnglish] of mails) {
      expect(mail.subject).not.toBe(inEnglish.subject);
      expect(mail.text).not.toBe(inEnglish.text);
    }
  });

  // The link, the inviter's name and the address survive translation.
  it("keep the data each email carries", () => {
    const t = emailText(locale);
    const mail = householdInvitationEmail({
      inviterName: "Ana",
      invitedEmail: "ben@example.com",
      siteUrl: "https://flatpare.com",
      expiresAt: new Date("2026-10-06T12:00:00Z"),
      t,
    });
    expect(mail.subject).toContain("Ana");
    expect(mail.text).toContain("ben@example.com");
    expect(mail.text).toContain("2026-10-06");
    expect(mail.text).toContain("https://flatpare.com");
    const link = magicLinkEmail({ url: "https://flatpare.com/x?token=1", siteHost: "flatpare.com", minutes: 15, t });
    expect(link.text).toContain("https://flatpare.com/x?token=1");
    expect(link.text).toContain("15");
  });
});
