"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { clearShares } from "@/lib/share-stash";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// A share waiting in this browser must not outlive the account (#190).
async function signOutClearingShares() {
  await clearShares();
  await signOut({ callbackUrl: "/" });
}

interface PendingInvitation {
  id: number;
  householdName: string;
  invitedByName: string | null;
  expiresAt: string;
}

const POLL_MS = 15_000;

// What went wrong, kept as data and put into words at render (#288): the
// server's own error text is shown as sent; otherwise the status, or which
// step failed, in the reader's language.
type PageError =
  | { kind: "server"; text: string }
  | { kind: "status"; status: number }
  | { kind: "load" }
  | { kind: "request" };

class RequestError extends Error {
  constructor(readonly pageError: PageError) {
    super(pageError.kind);
  }
}

async function readError(res: Response): Promise<PageError> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ? { kind: "server", text: body.error } : { kind: "status", status: res.status };
  } catch {
    return { kind: "status", status: res.status };
  }
}

// Reachable without a household (src/proxy.ts allow-lists it). No NavBar:
// every link in it leads somewhere that would bounce back here.
export default function InvitationsPage() {
  const t = useTranslations("invitations");
  const format = useFormatter();
  const [invitations, setInvitations] = useState<PendingInvitation[] | null>(null);
  const [error, setError] = useState<PageError | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/invitations/mine", { cache: "no-store" });
      if (!res.ok) throw new RequestError(await readError(res));
      const body = (await res.json()) as { invitations: PendingInvitation[] };
      setInvitations(body.invitations);
    } catch (err) {
      setError(err instanceof RequestError ? err.pageError : { kind: "load" });
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
      if (!res.ok) throw new RequestError(await readError(res));
      // The session cookie was refreshed server-side (unstable_update); a
      // full navigation makes the proxy read the new token.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/apartments");
    } catch (err) {
      setError(err instanceof RequestError ? err.pageError : { kind: "request" });
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-6 px-4 py-10">
      <h1 className="title-page">{t("title")}</h1>
      {error && (
        <p className="text-sm text-destructive">
          {error.kind === "server"
            ? error.text
            : error.kind === "status"
              ? t("requestFailedStatus", { status: error.status })
              : error.kind === "load"
                ? t("loadFailed")
                : t("requestFailed")}
        </p>
      )}
      {invitations === null && !error && (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      )}
      {invitations?.map((inv) => (
        <Card key={inv.id}>
          <CardHeader>
            <CardTitle>{inv.householdName}</CardTitle>
            <CardDescription>
              {(() => {
                const date = format.dateTime(new Date(inv.expiresAt), { year: "numeric", month: "numeric", day: "numeric" });
                return inv.invitedByName
                  ? t("invitedAndExpires", { name: inv.invitedByName, date })
                  : t("expires", { date });
              })()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button disabled={busy} onClick={() => post(`/api/invitations/${inv.id}/accept`)}>
              {t("accept")}
            </Button>
          </CardContent>
        </Card>
      ))}
      {invitations && invitations.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      )}
      {invitations && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => post("/api/invitations/decline")}>
            {invitations.length > 0 ? t("declineAndStartOwn") : t("startOwn")}
          </Button>
          <Button variant="ghost" onClick={() => void signOutClearingShares()}>
            {t("signOut")}
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("polling", { seconds: POLL_MS / 1000 })}</p>
    </main>
  );
}
