---
paths:
  - "src/lib/{ai-provider,parse-pdf,find-listing}.ts"
  - ".env.example"
---

# AI provider (#333)

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/ai-provider.md](../../docs/agents/ai-provider.md); read it before a non-trivial change here.

- **`src/lib/ai-provider.ts` is the only place that knows the AI backend**; never read `GOOGLE_GENERATIVE_AI_API_KEY` or name a model elsewhere. Google by default; `gateway` demands zero data retention per request and fails closed. **The hosted deployment runs `AI_PROVIDER=gateway`** and the privacy copy depends on it.
