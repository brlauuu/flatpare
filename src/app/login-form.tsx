"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { ThemedLogo } from "@/components/themed-logo";
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
  const t = useTranslations("auth.closed");
  return (
    <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground space-y-2">
      <p>
        {t.rich("lead", {
          strong: (chunks) => <strong className="font-medium text-foreground">{chunks}</strong>,
        })}
      </p>
      <p>{t("ask")}</p>
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
  const t = useTranslations("auth.notice");
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
          <p className="font-medium text-destructive">{t("signUpRefusedTitle")}</p>
          <p className="mt-1 text-muted-foreground">{t("signUpRefusedBody")}</p>
        </div>
      );
    case "beta-invalid":
      return (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <p className="font-medium text-destructive">{t("betaInvalidTitle")}</p>
          <p className="mt-1 text-muted-foreground">{t("betaInvalidBody")}</p>
        </div>
      );
    case "beta-ready":
      return (
        <p
          role="status"
          className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm"
        >
          {/* One message: the landing page states the same permanence. */}
          {t.rich("betaReady", { strong: (chunks) => <strong className="font-medium">{chunks}</strong> })}
        </p>
      );
    case "link-expired":
      return (
        <p role="status" className="rounded-md border p-3 text-sm">
          {t("linkExpired")}
        </p>
      );
    case "sign-in-failed":
      return (
        <p role="status" className="rounded-md border p-3 text-sm">
          {t("signInFailed")}
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
  const t = useTranslations("auth.card");
  const te = useTranslations("auth.errors");
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
        setError(te("linkNotSent"));
        return;
      }
      setLinkSentTo(email.trim());
    } catch {
      setError(te("linkNotSent"));
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
      setError(te("providerUnreachable"));
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
      setError(te("wrongPassword"));
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
          <ThemedLogo width={180} height={56} className="h-12 w-auto" priority />
          <p className="text-center text-xs text-muted-foreground">{t("tagline")}</p>
          <p className="text-center text-sm text-muted-foreground pt-2">{t("prompt")}</p>
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
              {t("continueWithGoogle")}
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
              {t("continueWithGithub")}
            </Button>
          )}
          {providers.includes("resend") &&
            (linkSentTo ? (
              <p role="status" className="rounded-md border p-3 text-sm">
                {t.rich("linkSent", {
                  email: linkSentTo,
                  strong: (chunks) => <strong className="font-medium">{chunks}</strong>,
                })}
              </p>
            ) : (
              <form onSubmit={handleEmail} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("emailLabel")}</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    className="h-11"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("emailPlaceholder")}
                    required
                  />
                </div>
                <Button type="submit" variant="outline" className="h-11 w-full" disabled={loading}>
                  {loading ? t("sendingLink") : t("sendLink")}
                </Button>
              </form>
            ))}
          {providers.includes("credentials") && (
            <form onSubmit={handlePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">{t("passwordLabel")}</Label>
                <Input
                  id="password"
                  type="password"
                  className="h-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("passwordPlaceholder")}
                  autoFocus
                />
              </div>
              <Button type="submit" className="h-11 w-full" disabled={loading}>
                {loading ? t("checkingPassword") : t("continue")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
