"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done" }
  // Which fixed message to show; the server's two refusals are fixed
  // sentences too, so they are mapped by status rather than shown in English.
  | { kind: "error"; reason: "invalidEmail" | "tooMany" | "failed" | "unreachable" };

// "Request a beta invite" in the hosted card (#301). Posts the address to
// /api/beta-requests, which stores it for the owner to answer with a beta
// pass. The answer is the same whether or not the address asked before, so
// the confirmation is too.
export function BetaRequestForm() {
  const t = useTranslations("landing.beta");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/beta-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, website }),
      });
      if (res.ok) {
        setState({ kind: "done" });
        return;
      }
      setState({
        kind: "error",
        reason: res.status === 400 ? "invalidEmail" : res.status === 429 ? "tooMany" : "failed",
      });
    } catch {
      setState({ kind: "error", reason: "unreachable" });
    }
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
