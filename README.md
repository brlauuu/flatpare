# Flatpare

[![CI](https://github.com/brlauuu/flatpare/actions/workflows/ci.yml/badge.svg)](https://github.com/brlauuu/flatpare/actions/workflows/ci.yml)
[![Tests](https://github.com/brlauuu/flatpare/actions/workflows/tests.yml/badge.svg)](https://github.com/brlauuu/flatpare/actions/workflows/tests.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-%3E%3D10-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/)
[![Dockerized](https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white)](./Dockerfile)
[![License: O'SAASY](https://img.shields.io/badge/license-O'SAASY-blue)](./LICENSE)

Apartment Tracker for collaborative apartment hunting in Basel.

## Features (MVP scope)

- Shared apartment list with per-user ratings and notes.
- Compare view for side-by-side user scoring.
- Manual apartment creation.
- Password gate on first access.
- PDF import/parsing through Fireworks AI via server-side API route.
- Vercel-first deployment.
- Full Docker support for local/prod-style container runtime.

## Requirements

- Node.js `>=20`
- npm `>=10`
- A Vercel account
- A Fireworks AI account
- Docker (optional, for containerized run/deploy)

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Fill the required values in `.env.local`.
3. Install dependencies:
   ```bash
   npm ci
   ```
4. Run the app:
   ```bash
   npm run dev
   ```

## Environment variables

| Variable | Required | Where used | Description |
|---|---|---|---|
| `APP_PASSWORD` | Yes | Vercel Function + local dev | Shared app password used by `api/verify-password`. |
| `FIREWORKS_API_KEY` | Yes | Vercel Function + local dev | API key used by Fireworks parsing route. |
| `FIREWORKS_MODEL` | Yes | Vercel Function + local dev | Fireworks model id for document extraction. |
| `PORT` | No | Docker/server runtime | HTTP port for containerized runtime (default `3000`). |

## Fireworks API key setup

1. Sign in to Fireworks AI.
2. Open dashboard -> API Keys (`https://fireworks.ai`).
3. Create a new API key.
4. Store it as:
   - Local: `.env.local` as `FIREWORKS_API_KEY`
   - Vercel: Project Settings -> Environment Variables as `FIREWORKS_API_KEY`

Do not commit API keys. `.env.local` must remain untracked.

## Vercel deployment

1. Import `brlauuu/flatpare` into Vercel.
2. Set environment variables in Project Settings -> Environment Variables:
   - `APP_PASSWORD`
   - `FIREWORKS_API_KEY`
   - `FIREWORKS_MODEL`
3. Deploy.
4. Validate in Preview:
   - Password gate appears on first visit.
   - PDF parsing succeeds for supported listing exports.

See [docs/setup-vercel-fireworks.md](./docs/setup-vercel-fireworks.md) for full details and troubleshooting.

## Docker run

This repo includes a production-style container that serves:

- Built frontend (`dist/`)
- `/api/verify-password`
- `/api/parse-pdf` (Fireworks-backed)

### Option A: Docker Compose

1. Export required env vars in your shell (or in an `.env` file used by Compose):
   - `APP_PASSWORD`
   - `FIREWORKS_API_KEY`
   - `FIREWORKS_MODEL`
2. Build and run:
   ```bash
   docker compose up --build
   ```
3. Open: `http://localhost:3000`

### Option B: Docker CLI

```bash
docker build -t flatpare:local .
docker run --rm -p 3000:3000 \
  -e APP_PASSWORD=change-me \
  -e FIREWORKS_API_KEY=your-key \
  -e FIREWORKS_MODEL=accounts/fireworks/models/llama-v3p1-8b-instruct \
  flatpare:local
```

## Quality gates

GitHub Actions workflows are included:

- `CI`: lint/build pipeline (`.github/workflows/ci.yml`)
- `Tests`: test pipeline (`.github/workflows/tests.yml`)

Target policy: merge only when checks are green.

## License

This project is licensed under **O'SAASY**. See [LICENSE](./LICENSE).

## Contributors

- `@brlauuu`
- OpenAI Codex (AI-assisted implementation support)
