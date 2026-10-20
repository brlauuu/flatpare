import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema-auth";
import { emailText } from "@/locales/email-text";

// Which language an email goes out in (#288): the recipient's own choice
// when their account has one, otherwise the language of whoever caused it.

const sent = vi.hoisted(() => [] as { to: string; subject: string }[]);
vi.mock("@/lib/email", () => ({
  emailEnabled: () => true,
  sendEmail: async (mail: { to: string; subject: string }) => {
    sent.push({ to: mail.to, subject: mail.subject });
    return { sent: true };
  },
}));

import { sendInvitationEmail, sendMemberRemovedEmail } from "../household-email";

const invitation = (email: string) => ({
  id: 1,
  email,
  expiresAt: new Date("2026-11-01T00:00:00Z"),
  invitedBy: "owner",
});

beforeEach(async () => {
  sent.length = 0;
  await db.delete(users);
  await db.insert(users).values({ id: "owner", email: "owner@example.com", name: "Ana" });
  await db.insert(users).values({ id: "fr-user", email: "fr@example.com", name: "Chloé", locale: "fr" });
  await db.insert(users).values({ id: "no-choice", email: "plain@example.com", name: "Ben" });
});

describe("the invitation email's language", () => {
  it("is the invitee's own when their address has an account that chose one", async () => {
    await sendInvitationEmail(invitation("fr@example.com"), "de");
    expect(sent[0].subject).toBe(emailText("fr")("invitation.subject", { name: "Ana" }));
  });

  it("is the inviter's when the invitee has no account", async () => {
    await sendInvitationEmail(invitation("stranger@example.com"), "it");
    expect(sent[0].subject).toBe(emailText("it")("invitation.subject", { name: "Ana" }));
  });

  it("is the inviter's when the invitee's account never chose one", async () => {
    await sendInvitationEmail(invitation("plain@example.com"), "es");
    expect(sent[0].subject).toBe(emailText("es")("invitation.subject", { name: "Ana" }));
  });
});

describe("the removal email's language", () => {
  it("is the removed member's own", async () => {
    await sendMemberRemovedEmail("fr-user", "owner", "de");
    expect(sent[0]).toEqual({ to: "fr@example.com", subject: emailText("fr")("memberRemoved.subject") });
  });

  it("is the remover's when the member never chose one", async () => {
    await sendMemberRemovedEmail("no-choice", "owner", "it");
    expect(sent[0].subject).toBe(emailText("it")("memberRemoved.subject"));
  });
});
