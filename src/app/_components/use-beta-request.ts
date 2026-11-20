"use client";

import { useState } from "react";

export type BetaRequestState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done" }
  // Which fixed message to show; the server's two refusals are fixed
  // sentences too, so they are mapped by status rather than shown in English.
  | { kind: "error"; reason: "invalidEmail" | "tooMany" | "failed" | "unreachable" };

// Posting a beta request (#301), shared by the landing page's form and the
// sign-in dialog's request view. /api/beta-requests stores the address for the
// owner to answer with a beta pass, and answers the same whether or not the
// address asked before, so both confirmations are the same too.
export function useBetaRequest() {
  const [state, setState] = useState<BetaRequestState>({ kind: "idle" });

  async function send(email: string, website: string) {
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

  return { state, send };
}
