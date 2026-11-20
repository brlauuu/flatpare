"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { ThemedLogo } from "@/components/themed-logo";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ErrorDisplay } from "@/components/error-display";
import type { PublicAccess } from "@/lib/public-access";
import { RequestAccess } from "./request-access";
import { useSetSignInDialogTitle } from "./_components/sign-in-dialog";

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

// The address a refused magic-link sign-in was for, carried across the page
// load the refusal causes, so the request view can fill it in. Session
// storage only: it never goes into the URL, where logs would keep it.
const REFUSED_EMAIL_KEY = "flatpare.refusedEmail";

function takeRefusedEmail(): string {
  try {
    const value = window.sessionStorage.getItem(REFUSED_EMAIL_KEY) ?? "";
    window.sessionStorage.removeItem(REFUSED_EMAIL_KEY);
    return value;
  } catch {
    return "";
  }
}

function NoticeFor({ notice }: { notice: SignInNotice }) {
  const t = useTranslations("auth.notice");
  switch (notice) {
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

  // While sign-ups are closed the card has a second view: asking for access.
  // A refused sign-in lands straight on it; a stale refusal in the URL after
  // the door has opened does not.
  const closed = access === "closed";
  const refused = closed && notice === "sign-up-refused";
  const [view, setView] = useState<"signIn" | "request">(refused ? "request" : "signIn");
  const [refusedEmail] = useState(() => (refused && typeof window !== "undefined" ? takeRefusedEmail() : ""));
  const setDialogTitle = useSetSignInDialogTitle();
  useEffect(() => {
    setDialogTitle(view);
  }, [view, setDialogTitle]);

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
        try {
          window.sessionStorage.setItem(REFUSED_EMAIL_KEY, email.trim());
        } catch {
          // Storage blocked: the request form just starts empty.
        }
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

  if (closed && view === "request") {
    return (
      <div className="w-full">
        <RequestAccess
          refused={refused}
          initialEmail={refusedEmail}
          onBack={() => setView("signIn")}
        />
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Rendered inside the landing page's sign-in dialog, which draws the
          frame; a second frame, shadow or background here would box it
          twice (#324). */}
      <Card className="w-full border-0 bg-transparent shadow-none">
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
          <NoticeFor notice={notice} />
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
          {/* The only beta wording before anyone tries: the landing page
              behind the dialog already says what Flatpare is. Hidden once a
              beta link was accepted, since that person is in. */}
          {closed && notice !== "beta-ready" && (
            <p className="border-t pt-4 text-center text-sm text-muted-foreground">
              {t.rich("newHere", {
                link: (chunks) => (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 font-medium underline"
                    onClick={() => setView("request")}
                  >
                    {chunks}
                  </Button>
                ),
              })}
            </p>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
