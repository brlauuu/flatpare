"use client";

import { useState } from "react";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done" }
  | { kind: "error"; message: string };

// "Request a beta invite" in the hosted card (#301). Posts the address to
// /api/beta-requests, which stores it for the owner to answer with a beta
// pass. The answer is the same whether or not the address asked before, so
// the confirmation is too.
export function BetaRequestForm() {
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
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setState({
        kind: "error",
        message:
          res.status === 400 || res.status === 429
            ? (body?.error ?? "Something went wrong. Please try again.")
            : "Something went wrong. Please try again.",
      });
    } catch {
      setState({ kind: "error", message: "Could not reach the server. Please try again." });
    }
  }

  if (state.kind === "done") {
    return (
      <p role="status" className="border-[3px] border-(--lp-line-strong) bg-(--lp-bg) p-4 text-[15px]">
        <strong>Thanks — you&apos;re on the list.</strong> We&apos;ll email your
        invite link to that address when a place opens.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor="beta-email" className="text-sm font-semibold">
        Request a beta invite
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
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="lp-input min-w-0 flex-[1_1_220px]"
        />
        <button type="submit" className="lp-btn lp-btn-primary" disabled={state.kind === "sending"}>
          {state.kind === "sending" ? "Sending…" : "Request invite →"}
        </button>
      </div>
      {/* The honeypot: off-screen, out of the tab order and hidden from
          assistive technology, so only a form-filling bot fills it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="beta-website">Website</label>
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
          {state.message}
        </p>
      )}
      <p className="text-[13px] text-(--lp-muted)">
        Used only to send your invite, and never for anything else.
      </p>
    </form>
  );
}
