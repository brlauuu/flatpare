"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCrypto } from "@/components/crypto/crypto-provider";

interface Member {
  userId: string;
  name: string | null;
  email: string;
  role: "owner" | "member";
  hasWrap: boolean;
}

interface Invitation {
  id: number;
  email: string;
  expiresAt: string;
  createdAt: string;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function HouseholdSettings() {
  const { state } = useCrypto();
  const encryptionOn = state !== "off";
  const [members, setMembers] = useState<Member[]>([]);
  const [me, setMe] = useState<{ userId: string; role: "owner" | "member" } | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isOwner = me?.role === "owner";

  const loadMembers = useCallback(async () => {
    const res = await fetch("/api/household/members", { cache: "no-store" });
    if (!res.ok) throw new Error(await readError(res));
    const body = (await res.json()) as { members: Member[]; me: { userId: string; role: "owner" | "member" } };
    setMembers(body.members);
    setMe(body.me);
    return body.me;
  }, []);

  const loadInvitations = useCallback(async () => {
    const res = await fetch("/api/invitations", { cache: "no-store" });
    if (!res.ok) throw new Error(await readError(res));
    const body = (await res.json()) as { invitations: Invitation[] };
    setInvitations(body.invitations);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const who = await loadMembers();
        if (who.role === "owner") await loadInvitations();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load household");
      }
    })();
  }, [loadMembers, loadInvitations]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  function invite(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const created = (await res.json()) as Invitation;
      setInvitations((prev) => [...prev, created]);
      setEmail("");
    });
  }

  function revoke(id: number) {
    void run(async () => {
      const res = await fetch(`/api/invitations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res));
      setInvitations((prev) => prev.filter((i) => i.id !== id));
    });
  }

  function remove(member: Member) {
    const label = member.name ?? member.email;
    if (!window.confirm(`Remove ${label} from the household? They lose access immediately.`)) {
      return;
    }
    void run(async () => {
      const res = await fetch(`/api/household/members/${member.userId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res));
      setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
    });
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Household</h2>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <ul className="divide-y rounded-md border">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm">{m.name ?? m.email}</p>
              {m.name && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{m.role}</Badge>
              {encryptionOn && !m.hasWrap && <Badge variant="secondary">awaiting key</Badge>}
              {isOwner && m.userId !== me?.userId && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove(m)}>
                  Remove
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {isOwner && (
        <>
          <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>
            <Button type="submit" disabled={busy || email.trim().length === 0}>
              Invite
            </Button>
          </form>
          <p className="text-sm text-muted-foreground">
            No email is sent. Tell them to sign in with that address; the
            invitation is waiting for them there for 7 days.
          </p>
          {invitations.length > 0 && (
            <ul className="divide-y rounded-md border">
              {invitations.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Pending · expires {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => revoke(inv.id)}>
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
