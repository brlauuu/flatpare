"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface PendingInvitation {
  id: number;
  householdName: string;
  invitedByName: string | null;
  expiresAt: string;
}

const POLL_MS = 15_000;

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

// Reachable without a household (src/proxy.ts allow-lists it). No NavBar:
// every link in it leads somewhere that would bounce back here.
export default function InvitationsPage() {
  const [invitations, setInvitations] = useState<PendingInvitation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/invitations/mine", { cache: "no-store" });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { invitations: PendingInvitation[] };
      setInvitations(body.invitations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load invitations");
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  async function post(path: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST" });
      if (!res.ok) throw new Error(await readError(res));
      // The session cookie was refreshed server-side (unstable_update); a
      // full navigation makes the proxy read the new token.
      window.location.assign("/apartments");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">Join a household</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {invitations === null && !error && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
      {invitations?.map((inv) => (
        <Card key={inv.id}>
          <CardHeader>
            <CardTitle>{inv.householdName}</CardTitle>
            <CardDescription>
              {inv.invitedByName ? `Invited by ${inv.invitedByName}. ` : ""}
              Expires {new Date(inv.expiresAt).toLocaleDateString()}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button disabled={busy} onClick={() => post(`/api/invitations/${inv.id}/accept`)}>
              Accept
            </Button>
          </CardContent>
        </Card>
      ))}
      {invitations && invitations.length === 0 && (
        <p className="text-sm text-muted-foreground">
          You have no pending invitations. Ask the household owner to invite the
          email address you signed in with, or start your own household.
        </p>
      )}
      {invitations && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => post("/api/invitations/decline")}>
            {invitations.length > 0 ? "No thanks, start my own household" : "Start my own household"}
          </Button>
          <Button variant="ghost" onClick={() => signOut({ callbackUrl: "/" })}>
            Sign out
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        This page checks for new invitations every 15 seconds.
      </p>
    </main>
  );
}
