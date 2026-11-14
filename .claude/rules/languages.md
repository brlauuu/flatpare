---
paths:
  - "src/i18n/**"
  - "src/locales/**"
  - "messages/**"
  - "src/content/**"
  - "src/components/language-menu.tsx"
  - "src/app/api/account/locale/**"
---

# Languages (#288)

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/languages.md](../../docs/agents/languages.md); read it before a non-trivial change here.

- Five languages via `next-intl` **without i18n routing** (no locale in URLs). Locale: cookie → `users.locale` → `Accept-Language` → English.
- **`src/locales/` is a leaf; nothing under `src/lib` or at `src/` root may import `src/i18n`** (module cycle).
- **Never concatenate translated fragments; never call `toLocaleString()` without a locale.** Use ICU messages and `useFormatter()`. Pure modules take text objects from the caller. Swiss conventions (`de-CH`…), informal address, no ß.
- A new namespace goes in `NAMESPACES`, `global.d.ts` and every locale; `catalogues.test.ts` enforces parity. Tests render the real English catalogue; `setTestLocale("de")` for language tests.
- Server-sent error text is shown as sent. **A change to the English guide is a change to all five** (`guide-locales.test.tsx`). Keep the German PDF-extraction patterns.
