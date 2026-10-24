"use client";

import { CreditBalance } from "@/components/credit-balance";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCrypto } from "@/components/crypto/crypto-context";
import { useFlowErrorText } from "@/components/crypto/use-flow-error-text";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import { KeyFingerprint } from "@/components/key-fingerprint";
import { displayName } from "@/lib/display-name";

interface Member {
  userId: string;
  name: string | null;
  email: string;
  role: "owner" | "member";
  hasWrap: boolean;
  publicKey: string | null;
}

// The confirmation for each kind of role change (#192). stepDownConfirm has
// no {name}; next-intl ignores the extra value.
const ROLE_CONFIRM = {
  promote: "members.promoteConfirm",
  demote: "members.demoteConfirm",
  stepDown: "members.stepDownConfirm",
} as const;

function roleChange(role: "owner" | "member", self: boolean): keyof typeof ROLE_CONFIRM {
  if (role === "owner") return "promote";
  return self ? "stepDown" : "demote";
}

// "The recovery kit was replaced" (#192), for an owner who did not make it.
interface RecoveryNotice {
  by: string | null;
  at: string;
}

interface Invitation {
  id: number;
  email: string;
  expiresAt: string;
  createdAt: string;
}

// The route's own error text is shown as sent (English until server errors
// are translated); only the fallback is in the catalogue.
async function readError(res: Response, fallback: (status: number) => string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback(res.status);
  } catch {
    return fallback(res.status);
  }
}

export function HouseholdSettings() {
  const t = useTranslations("household");
  const format = useFormatter();
  const router = useRouter();
  const failed = useCallback((status: number) => t("errors.requestFailedStatus", { status }), [t]);
  const { state, status: cryptoStatus, keys, showRecoveryKit } = useCrypto();
  const { limits, rotateDataKey } = useHouseholdData();
  // Rotation errors are thrown in English by the flow; this puts the known
  // ones in the reader's language (#288).
  const flowText = useFlowErrorText();
  const encryptionOn = state !== "off";
  const [rotating, setRotating] = useState(false);
  const [rotationNote, setRotationNote] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [me, setMe] = useState<{ userId: string; role: "owner" | "member" } | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<RecoveryNotice | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [inviteNote, setInviteNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isOwner = me?.role === "owner";
  // Co-owners (#192): an owner may leave or step down while another remains.
  const ownerCount = members.filter((m) => m.role === "owner").length;
  const canLeave = me !== null && (!isOwner || ownerCount > 1);
  // Pending invitations occupy a slot: the server counts them the same way
  // at send time, so the UI must not offer an invite that would 409.
  const atMemberLimit =
    limits.maxMembers !== null &&
    members.length + invitations.length >= limits.maxMembers;

  const loadMembers = useCallback(async () => {
    const res = await fetch("/api/household/members", { cache: "no-store" });
    if (!res.ok) throw new Error(await readError(res, failed));
    const body = (await res.json()) as {
      members: Member[];
      me: { userId: string; role: "owner" | "member" };
      recoveryNotice?: RecoveryNotice | null;
    };
    setMembers(body.members);
    setMe(body.me);
    setRecoveryNotice(body.recoveryNotice ?? null);
    return body.me;
  }, [failed]);

  const loadInvitations = useCallback(async () => {
    const res = await fetch("/api/invitations", { cache: "no-store" });
    if (!res.ok) throw new Error(await readError(res, failed));
    const body = (await res.json()) as { invitations: Invitation[] };
    setInvitations(body.invitations);
  }, [failed]);

  useEffect(() => {
    (async () => {
      try {
        const who = await loadMembers();
        if (who.role === "owner") await loadInvitations();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errors.loadFailed"));
      }
    })();
  }, [loadMembers, loadInvitations, t]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviteNote(null);
    void run(async () => {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error(await readError(res, failed));
      const created = (await res.json()) as Invitation & {
        emailed?: "sent" | "failed" | "off";
      };
      setInvitations((prev) => [...prev, created]);
      setEmail("");
      // Say what happened to the email (#300). The invitation is valid either
      // way; what changes is whether the owner has to tell the person.
      setInviteNote(
        created.emailed === "sent"
          ? t("invite.emailed", { email: created.email })
          : created.emailed === "failed"
            ? t("invite.emailFailed", { email: created.email })
            : t("invite.created", { email: created.email })
      );
    });
  }

  function revoke(id: number) {
    void run(async () => {
      const res = await fetch(`/api/invitations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res, failed));
      setInvitations((prev) => prev.filter((i) => i.id !== id));
    });
  }

  // Data-key rotation (#219): re-seals everything under a fresh key so the
  // removed member's cached key opens nothing written from now on, and ends
  // with a NEW recovery code the owner must save. Also offered on its own
  // while `rotationDue` is set, i.e. a removal happened and its rotation
  // did not land.
  async function rotate(): Promise<void> {
    setRotating(true);
    setRotationNote(null);
    try {
      const { recoveryCode, report } = await rotateDataKey();
      if (report.pdfFailures.length > 0) {
        setRotationNote(t("key.pdfFailures", { count: report.pdfFailures.length }));
      }
      showRecoveryKit(recoveryCode);
    } finally {
      setRotating(false);
    }
  }

  // Self-service leave (#220). A member, or an owner while another owner
  // remains (#192). The session is refreshed server-side and lands on a fresh household of the
  // leaver's own; a full navigation makes the proxy read the new cookie.
  function leave() {
    const message = encryptionOn ? t("members.leaveConfirmEncrypted") : t("members.leaveConfirm");
    if (!window.confirm(message)) return;
    void run(async () => {
      const res = await fetch("/api/household/leave", { method: "POST" });
      if (!res.ok) throw new Error(await readError(res, failed));
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/apartments");
    });
  }

  // Promote, demote, or step down (#192). The server keeps at least one
  // owner. Changing your own role re-renders the layout, whose role (read from
  // the database) decides what else the page offers, such as Recompute.
  function changeRole(member: Member, role: "owner" | "member") {
    const self = member.userId === me?.userId;
    const name = displayName(member.name, member.email);
    if (!window.confirm(t(ROLE_CONFIRM[roleChange(role, self)], { name }))) return;
    void run(async () => {
      const res = await fetch(`/api/household/members/${member.userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error(await readError(res, failed));
      await loadMembers();
      if (self) router.refresh();
    });
  }

  function dismissRecoveryNotice() {
    void run(async () => {
      const res = await fetch("/api/household/recovery-notice", { method: "POST" });
      if (!res.ok) throw new Error(await readError(res, failed));
      setRecoveryNotice(null);
    });
  }

  function remove(member: Member) {
    const label = displayName(member.name, member.email);
    const message = encryptionOn
      ? t("members.removeConfirmEncrypted", { name: label })
      : t("members.removeConfirm", { name: label });
    if (!window.confirm(message)) return;
    void run(async () => {
      const res = await fetch(`/api/household/members/${member.userId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res, failed));
      const { emailed } = (await res.json().catch(() => ({}))) as {
        emailed?: "sent" | "failed" | "off";
      };
      setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
      // Same rule as inviting (#300): say what happened to the email, so the
      // owner knows whether the person has been told (#298).
      setInviteNote(
        emailed === "sent"
          ? t("members.removedEmailed", { name: label })
          : emailed === "failed"
            ? t("members.removedEmailFailed", { name: label })
            : t("members.removed", { name: label })
      );
      if (state !== "unlocked") return;
      try {
        await rotate();
      } catch (err) {
        const reason = err instanceof Error ? flowText(err, "provider.somethingWrong") : t("members.unknownError");
        throw new Error(t("members.removedRotationFailed", { name: label, reason }));
      }
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-baseline gap-2">
        <h2 className="title-section">{t("members.title")}</h2>
        {/* Only when a cap is configured — a self-hoster must not see a
            counter implying a limit that does not exist. */}
        {limits.maxMembers !== null && (
          <span className="text-sm text-muted-foreground">
            {t("members.count", { used: members.length + invitations.length, max: limits.maxMembers })}
          </span>
        )}
      </div>
      {/* Renders nothing when billing is off. */}
      <CreditBalance />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {inviteNote && (
        <p role="status" className="text-sm text-muted-foreground">
          {inviteNote}
        </p>
      )}

      {encryptionOn && recoveryNotice && (
        <RecoveryKitNotice notice={recoveryNotice} busy={busy} onDismiss={dismissRecoveryNotice} />
      )}

      {encryptionOn && (
        <p className="text-sm text-muted-foreground">{t("fingerprint.compare")}</p>
      )}

      <ul className="divide-y rounded-md border">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm">{displayName(m.name, m.email)}</p>
              {m.name?.trim() && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
              {encryptionOn && <MemberFingerprint member={m} own={m.userId === me?.userId} devicePublicKey={keys?.publicKey ?? null} />}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge variant="outline">{t(`members.role.${m.role}`)}</Badge>
              {encryptionOn && !m.hasWrap && <Badge variant="secondary">{t("members.awaitingKey")}</Badge>}
              {isOwner && (
                <MemberActions
                  member={m}
                  self={m.userId === me?.userId}
                  ownerCount={ownerCount}
                  busy={busy}
                  onRole={changeRole}
                  onRemove={remove}
                />
              )}
            </div>
          </li>
        ))}
      </ul>

      {canLeave && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={leave}>
            {t("members.leave")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t("members.leaveNote")}
          </span>
        </div>
      )}

      {isOwner && (
        <>
          <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor="invite-email">{t("invite.emailLabel")}</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("invite.emailPlaceholder")}
              />
            </div>
            <Button
              type="submit"
              disabled={busy || email.trim().length === 0 || atMemberLimit}
            >
              {t("invite.submit")}
            </Button>
          </form>
          <p className="text-sm text-muted-foreground">
            {atMemberLimit
              ? t("invite.atLimit", { max: limits.maxMembers ?? 0 })
              : t("invite.noEmail")}
          </p>
          {invitations.length > 0 && (
            <ul className="divide-y rounded-md border">
              {invitations.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("invite.pending", { date: format.dateTime(new Date(inv.expiresAt), { dateStyle: "short" }) })}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => revoke(inv.id)}>
                    {t("invite.revoke")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {encryptionOn && isOwner && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-medium">{t("key.title")}</h3>
            <span className="text-xs text-muted-foreground">
              {t("key.version", { version: cryptoStatus?.keyVersion ?? 1 })}
            </span>
          </div>
          {cryptoStatus?.rotationDue ? (
            <p role="alert" className="text-sm text-destructive">
              {t("key.rotationDue")}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("key.explain")}
            </p>
          )}
          {rotationNote && <p className="text-sm">{rotationNote}</p>}
          <Button
            type="button"
            variant={cryptoStatus?.rotationDue ? "default" : "outline"}
            size="sm"
            disabled={busy || rotating || state !== "unlocked"}
            onClick={() =>
              void rotate().catch((err) =>
                setError(err instanceof Error ? flowText(err, "provider.somethingWrong") : t("key.rotateError"))
              )
            }
          >
            {rotating ? t("key.rotating") : t("key.rotate")}
          </Button>
        </div>
      )}
    </section>
  );
}

// What an owner can do to one row (#192): promote or demote and remove
// anyone else; step down themselves while another owner remains.
function MemberActions({
  member,
  self,
  ownerCount,
  busy,
  onRole,
  onRemove,
}: {
  member: Member;
  self: boolean;
  ownerCount: number;
  busy: boolean;
  onRole: (member: Member, role: "owner" | "member") => void;
  onRemove: (member: Member) => void;
}) {
  const t = useTranslations("household.members");
  if (self) {
    if (ownerCount < 2) return null;
    return (
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRole(member, "member")}>
        {t("stepDown")}
      </Button>
    );
  }
  const owner = member.role === "owner";
  return (
    <>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRole(member, owner ? "member" : "owner")}>
        {owner ? t("demote") : t("promote")}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRemove(member)}>
        {t("remove")}
      </Button>
    </>
  );
}

// There is one recovery kit per household, and making a new one invalidates
// every other copy (#192). Shown to each owner who did not make it.
function RecoveryKitNotice({
  notice,
  busy,
  onDismiss,
}: {
  notice: RecoveryNotice;
  busy: boolean;
  onDismiss: () => void;
}) {
  const t = useTranslations("household.recoveryNotice");
  const format = useFormatter();
  const date = format.dateTime(new Date(notice.at), { dateStyle: "medium" });
  return (
    <div role="status" className="space-y-2 rounded-md border border-warning p-3">
      <p className="text-sm">
        {notice.by ? t("text", { name: notice.by, date }) : t("textUnknown", { date })}
      </p>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onDismiss}>
        {t("dismiss")}
      </Button>
    </div>
  );
}

// The signed-in member's own code comes from the key on THIS device, never
// from the server's copy (#218): a substituted key would otherwise fingerprint
// as itself and the comparison would prove nothing. Everyone else's
// necessarily comes from the key the server returns.
function MemberFingerprint({
  member,
  own,
  devicePublicKey,
}: {
  member: Member;
  own: boolean;
  devicePublicKey: string | null;
}) {
  const t = useTranslations("household.fingerprint");
  if (own) {
    if (!devicePublicKey) {
      return <p className="text-xs text-muted-foreground">{t("unlockToSee")}</p>;
    }
    return (
      <>
        <KeyFingerprint spki={devicePublicKey} />
        {member.publicKey !== null && member.publicKey !== devicePublicKey && (
          <p role="alert" className="text-xs text-destructive">
            {t("ownMismatch")}
          </p>
        )}
      </>
    );
  }
  if (!member.publicKey) {
    return <p className="text-xs text-muted-foreground">{t("noKeyYet")}</p>;
  }
  return <KeyFingerprint spki={member.publicKey} />;
}
