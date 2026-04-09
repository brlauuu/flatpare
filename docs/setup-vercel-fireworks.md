# Vercel + Fireworks Setup

This document covers deployment and secret configuration for the Apartment Tracker MVP.

## 1. Fireworks setup

1. Sign in at `https://fireworks.ai`.
2. Open the dashboard API key section.
3. Create a new API key.
4. Keep the key private and rotate it if exposed.

Required env vars:

- `FIREWORKS_API_KEY`
- `FIREWORKS_MODEL`

`FIREWORKS_MODEL` must match a valid Fireworks model id in your account.

## 2. Local development secrets

1. Copy `.env.example` to `.env.local`.
2. Set values:
   - `APP_PASSWORD`
   - `FIREWORKS_API_KEY`
   - `FIREWORKS_MODEL`
3. Never commit `.env.local`.

## 3. Vercel deployment secrets

1. Open your Vercel project.
2. Go to Project Settings -> Environment Variables.
3. Add:
   - `APP_PASSWORD`
   - `FIREWORKS_API_KEY`
   - `FIREWORKS_MODEL`
4. Apply each variable to Production, Preview, and Development as needed.
5. Redeploy after updating secrets.

## 4. Post-deploy verification

1. Open the deployed app in a fresh browser/private window.
2. Confirm password gate appears.
3. Enter the shared password and confirm app unlock.
4. Upload a supported listing PDF and confirm parser returns structured values.
5. Confirm manual add still works if parsing fails.

## 5. Troubleshooting

- `401` or `403` from parser route:
  - Verify `FIREWORKS_API_KEY` is valid and active.
- Parser returns empty/partial fields:
  - Check `FIREWORKS_MODEL` and test with a clearer PDF export.
- Password gate always fails:
  - Verify `APP_PASSWORD` in Vercel env vars and local `.env.local`.
- Works locally but not on Vercel:
  - Confirm env vars are set for the target Vercel environment.
