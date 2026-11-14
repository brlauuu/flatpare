---
paths:
  - "src/lib/{upload-pdf,storage,pdf-file-name}.ts"
  - "src/app/api/{files,pdf,uploads}/**"
  - "src/app/api/process/parse-pdf/**"
  - "src/components/pdf-too-large-notice.tsx"
---

# File uploads

Loaded when you read or edit a file matching the paths above. The reasoning, measurements and history behind these rules are in [docs/agents/file-uploads.md](../../docs/agents/file-uploads.md); read it before a non-trivial change here.

- **PDFs are encrypted in the browser before upload** and stored as `application/octet-stream`; the server never learns whether a file is encrypted. Files over about 4.5 MB must use the Vercel Blob path (`uploadEncryptedFile` probes for it).
- **A PDF is read only in memory** (`/api/process/parse-pdf`); the read is capped at 4.5 MB on Vercel. By decision: no trimming in the browser, no plaintext upload to Blob to get around it.
- Replacing a file uploads under a new revision name, points the row at it, then deletes the old file — Blob refuses to overwrite, and a row must never point at bytes it cannot open.
