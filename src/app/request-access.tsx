"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useBetaRequest } from "./_components/use-beta-request";

// The sign-in card's request-access view, while FLATPARE_PUBLIC_ACCESS=closed.
//
// Someone turned away at sign-in used to get two stacked boxes saying sign-ups
// were closed, pointing at a form hidden behind the dialog. Now the card says
// it once and puts the request right here. The owner answers each request by
// hand with a beta pass (`scripts/beta-pass.mjs`), which is why the next step
// it names is "open the link, then sign in".
//
// `refused` is the arrival after a refused sign-in; otherwise the person chose
// "Request access" themselves. The address is filled in when the refusal came
// from the email form; with Google the app never learns it.
export function RequestAccess({
  refused,
  initialEmail = "",
  onBack,
}: {
  refused: boolean;
  initialEmail?: string;
  onBack: () => void;
}) {
  const t = useTranslations("auth.request");
  const tb = useTranslations("landing.beta");
  const [email, setEmail] = useState(initialEmail);
  const [website, setWebsite] = useState("");
  const [showLinkHelp, setShowLinkHelp] = useState(false);
  const { state, send } = useBetaRequest();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void send(email, website);
  }

  if (state.kind === "done") {
    return (
      <div className="space-y-4 p-6">
        <h2 className="title-section">{t("sentTitle")}</h2>
        <p role="status" className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
          {t.rich("sent", { strong: (chunks) => <strong className="font-medium">{chunks}</strong> })}
        </p>
        <Button type="button" variant="link" className="h-auto p-0 text-foreground underline" onClick={onBack}>
          {t("back")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div className="space-y-2">
        <h2 className="title-section">{refused ? t("refusedTitle") : t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("lead")}</p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="request-email">{t("emailLabel")}</Label>
          <Input
            id="request-email"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            className="h-11"
            required
            maxLength={254}
            placeholder={tb("placeholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {/* The honeypot: off-screen, out of the tab order and hidden from
            assistive technology, so only a form-filling bot fills it. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor="request-website">{tb("honeypot")}</label>
          <input
            id="request-website"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
        {state.kind === "error" && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {tb(state.reason)}
          </p>
        )}
        <Button type="submit" className="h-11 w-full" disabled={state.kind === "sending"}>
          {state.kind === "sending" ? t("sending") : t("submit")}
        </Button>
        <p className="text-xs text-muted-foreground">{tb("privacy")}</p>
      </form>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-foreground underline"
          aria-expanded={showLinkHelp}
          onClick={() => setShowLinkHelp((v) => !v)}
        >
          {t("haveLink")}
        </Button>
        <Button type="button" variant="link" className="h-auto p-0 text-foreground underline" onClick={onBack}>
          {t("back")}
        </Button>
      </div>
      {showLinkHelp && (
        <p className="border-l-[3px] border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t("haveLinkBody")}
        </p>
      )}
    </div>
  );
}
