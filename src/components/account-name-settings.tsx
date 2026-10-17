"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import { MAX_DISPLAY_NAME } from "@/lib/display-name";

// The signed-in person's display name (#327), shown on rating cards, the
// compare table, the Household page and in the menu. Account data, not
// household data: it is stored in plaintext beside the email (see
// src/lib/display-name.ts), so this talks to its own route rather than the
// encrypted store.
//
// After a save the page's server data is refreshed (the nav's name comes
// from the shared layout) and the store reloads (ratings carry the rater's
// name), so the new name shows everywhere without a full reload.
export function AccountNameSettings() {
  const router = useRouter();
  const { reload } = useHouseholdData();
  const [name, setName] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/name")
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const body = (await res.json()) as { name: string | null; email: string };
        if (cancelled) return;
        setName(body.name ?? "");
        setEmail(body.email);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load your name. Reload the page to try again.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/account/name", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = (await res.json().catch(() => ({}))) as { name?: string | null; error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't save your name.");
        return;
      }
      setName(body.name ?? "");
      setMessage("Saved.");
      router.refresh();
      await reload();
    } catch {
      setError("Couldn't save your name.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="title-section">Your name</h2>
      <form onSubmit={save} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="account-name">Your name</Label>
          <Input
            id="account-name"
            autoComplete="name"
            maxLength={MAX_DISPLAY_NAME * 2}
            value={name}
            disabled={!loaded}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Shown to the members of your household on ratings, the comparison and the Household page.
          {email && name.trim() === "" && <> Until you set one, they see your email, {email}.</>}
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {message && <p className="text-sm">{message}</p>}
        <Button type="submit" disabled={busy || !loaded}>
          Save name
        </Button>
      </form>
    </section>
  );
}
