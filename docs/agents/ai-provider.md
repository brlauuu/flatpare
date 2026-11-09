# AI provider (#333)

Full reference, moved verbatim from AGENTS.md. The always-on rules for this area are summarised in AGENTS.md; this file holds the detail, the measurements and the history behind them.

- **`src/lib/ai-provider.ts` is the only place that knows which AI backend reads PDFs.** `parse-pdf.ts` asks it for the model and request options; the parse-pdf route asks it whether AI is available. Never read `GOOGLE_GENERATIVE_AI_API_KEY` or name a model anywhere else.
- **Google is the default** so a self-hoster needs no extra account. Its terms are tier-dependent and it has no zero-retention setting, so `AI_ZERO_DATA_RETENTION` on the Google path is a config error rather than silently ignored.
- **`gateway` demands zero data retention on every request** (`providerOptions.gateway.zeroDataRetention`). The gateway then routes only to providers with a ZDR agreement and **fails** (`no_providers_available`) rather than falling back — so a ZDR claim cannot quietly become false. `AI_ZERO_DATA_RETENTION=false` exists only because request-level ZDR needs a Vercel Pro plan.
- **The hosted deployment runs `AI_PROVIDER=gateway`, and the landing page's privacy statement depends on it.** The boot log says which mode is live (`[ai] …`); check it after changing env vars. Invalid `AI_*` values fail boot.
- Changing the model is `AI_MODEL`; a model not in AI Gateway's ZDR set fails every request on the gateway path, which is the guarantee working.
