"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Image from "next/image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ErrorDisplay } from "@/components/error-display";
import type { PublicAccess } from "@/lib/public-access";

type ProviderId = "google" | "github" | "resend" | "credentials";

// What the sign-in flow redirected back with (#239):
//   sign-up-refused — a sign-in that would have created an account was
//                     turned away because public access is closed;
//   beta-ready      — a beta link was accepted and its cookie is set;
//   beta-invalid    — a beta link was revoked, expired or used up.
//   link-expired    — a magic link was already used or has expired (#310);
//   sign-in-failed  — any other error Auth.js redirected back with.
export type SignInNotice =
  | "sign-up-refused"
  | "beta-ready"
  | "beta-invalid"
  | "link-expired"
  | "sign-in-failed"
  | null;

// The holding notice while FLATPARE_PUBLIC_ACCESS=closed. Honest and short,
// per #239: what is happening, roughly when it opens, and a way to ask for
// a place — no countdown, no invented waitlist numbers. Since #301 the way
// to ask is the landing page's beta-invite form, which sits behind this card
// (it opens in a dialog there), so this points at it instead of a link. Existing accounts
// and beta invitations still sign in, so the buttons stay.
function ClosedNotice() {
  return (
    <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground space-y-2">
      <p>
        <strong className="font-medium text-foreground">
          Flatpare is in a private beta.
        </strong>{" "}
        New sign-ups are closed while billing is finished; we expect to open
        later this year. Existing accounts and beta invitations still sign in
        below.
      </p>
      <p>
        Want a place in the beta? Request an invite with the form on this
        page.
      </p>
    </div>
  );
}

function NoticeFor({
  notice,
  access,
}: {
  notice: SignInNotice;
  access: PublicAccess;
}) {
  switch (notice) {
    case "sign-up-refused":
      // Only meaningful while the door is shut: a bookmarked redirect URL
      // must not claim sign-ups are closed after the gate has been opened.
      if (access !== "closed") return null;
      return (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <p className="font-medium text-destructive">Sign-ups are closed for now</p>
          <p className="mt-1 text-muted-foreground">
            There is no account for that address yet, and this browser holds
            no beta invitation. If you were given a beta link, open it first
            and then sign in again.
          </p>
        </div>
      );
    case "beta-invalid":
      return (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <p className="font-medium text-destructive">
            That beta link is no longer valid
          </p>
          <p className="mt-1 text-muted-foreground">
            It may have expired, been used up, or been revoked. Ask the person
            who sent it for a new one.
          </p>
        </div>
      );
    case "beta-ready":
      return (
        <p
          role="status"
          className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm"
        >
          <strong className="font-medium">Your beta invitation is ready.</strong>{" "}
          Sign in below to create your account. Beta accounts are free, and
          what you get is yours to keep: neither your data nor your credits
          are taken back when the beta ends.
        </p>
      );
    case "link-expired":
      return (
        <p role="status" className="rounded-md border p-3 text-sm">
          That sign-in link has expired or was already used. Enter your email
          below and we will send a fresh one.
        </p>
      );
    case "sign-in-failed":
      return (
        <p role="status" className="rounded-md border p-3 text-sm">
          Sign-in did not go through. Please try again.
        </p>
      );
    default:
      return null;
  }
}

export function LoginForm({
  providers,
  access = "open",
  notice = null,
}: {
  providers: ProviderId[];
  access?: PublicAccess;
  notice?: SignInNotice;
}) {
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Magic link (#310). `redirect: false` keeps the person on this card: the
  // card says the link was sent instead of bouncing them to Auth.js's own
  // "check your email" page. A refused sign-up still has to leave, because
  // the server answered with the landing page's own explanation URL.
  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await signIn("resend", { email, redirect: false, callbackUrl: "/apartments" });
      if (res?.url && /[?&]signin=closed/.test(res.url)) {
        window.location.assign(res.url);
        return;
      }
      if (!res || res.error) {
        setError("Couldn't send the sign-in link. Check the address and try again.");
        return;
      }
      setLinkSentTo(email.trim());
    } catch {
      setError("Couldn't send the sign-in link. Check the address and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "github") {
    setError(null);
    setLoading(true);
    try {
      await signIn(provider, { callbackUrl: "/apartments" });
    } catch {
      setError("Couldn't reach the sign-in provider.");
      setLoading(false);
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await signIn("credentials", {
      password,
      redirect: false,
      callbackUrl: "/apartments",
    });

    if (!res || res.error) {
      setError("Wrong password");
      setLoading(false);
      return;
    }

    window.location.assign(res.url ?? "/apartments");
  }

  return (
    <div className="w-full">
      {/* Rendered inside the landing page's sign-in dialog, which draws the
          frame; a second frame and shadow here would box it twice (#324). */}
      <Card className="w-full border-0 shadow-none">
        <CardHeader className="items-center space-y-3">
          <Image
            src="/flatpare_logo.svg"
            alt="Flatpare"
            width={180}
            height={56}
            className="h-12 w-auto dark:invert"
            priority
          />
          <p className="text-center text-xs text-muted-foreground">
            Compare apartments together
          </p>
          <p className="text-center text-sm text-muted-foreground pt-2">
            Sign in to continue
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Outside the credentials block on purpose: an OAuth failure sets
              this too, and while it lived inside the password form the error
              was invisible on an OAuth-only deployment. */}
          {error && <ErrorDisplay headline={error} />}
          {access === "closed" && notice !== "beta-ready" && <ClosedNotice />}
          <NoticeFor notice={notice} access={access} />
          {providers.includes("google") && (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              disabled={loading}
              onClick={() => handleOAuth("google")}
            >
              Continue with Google
            </Button>
          )}
          {providers.includes("github") && (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              disabled={loading}
              onClick={() => handleOAuth("github")}
            >
              Continue with GitHub
            </Button>
          )}
          {providers.includes("resend") &&
            (linkSentTo ? (
              <p role="status" className="rounded-md border p-3 text-sm">
                <strong className="font-medium">Check your email.</strong> We sent a
                sign-in link to {linkSentTo}. It works once and expires in 15
                minutes; open it in this browser.
              </p>
            ) : (
              <form onSubmit={handleEmail} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    className="h-11"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>
                <Button type="submit" variant="outline" className="h-11 w-full" disabled={loading}>
                  {loading ? "Sending…" : "Email me a sign-in link"}
                </Button>
              </form>
            ))}
          {providers.includes("credentials") && (
            <form onSubmit={handlePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  className="h-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoFocus
                />
              </div>
              <Button type="submit" className="h-11 w-full" disabled={loading}>
                {loading ? "Checking..." : "Continue"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
