"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { useBetaRequest } from "./use-beta-request";

// "Request a beta invite" in the hosted card (#301). The posting is shared
// with the sign-in dialog's request view (use-beta-request.ts).
export function BetaRequestForm() {
  const t = useTranslations("landing.beta");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const { state, send } = useBetaRequest();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void send(email, website);
  }

  if (state.kind === "done") {
    return (
      <p role="status" className="border-[3px] border-(--lp-line-strong) bg-(--lp-bg) p-4 text-[15px]">
        {t.rich("thanks", { b: (chunks) => <strong>{chunks}</strong> })}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor="beta-email" className="text-sm font-semibold">
        {t("label")}
      </label>
      <div className="flex flex-wrap gap-2.5">
        <input
          id="beta-email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          placeholder={t("placeholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="lp-input min-w-0 flex-[1_1_220px]"
        />
        <button type="submit" className="lp-btn lp-btn-primary" disabled={state.kind === "sending"}>
          {state.kind === "sending" ? t("sending") : t("submit")}
        </button>
      </div>
      {/* The honeypot: off-screen, out of the tab order and hidden from
          assistive technology, so only a form-filling bot fills it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="beta-website">{t("honeypot")}</label>
        <input
          id="beta-website"
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>
      {state.kind === "error" && (
        <p role="alert" className="text-sm font-semibold text-(--lp-accent-text)">
          {t(state.reason)}
        </p>
      )}
      <p className="text-[13px] text-(--lp-muted)">
        {t("privacy")}
      </p>
    </form>
  );
}
