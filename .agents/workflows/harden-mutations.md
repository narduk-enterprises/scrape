---
description:
  Harden server mutations with wrappers, auth classes, rate limits, and schema
  validation
---

# Harden Mutations

Use the `mutation-hardening` skill first. Use `exception-triage` only when a
temporary suppression is unavoidable.

## 1. Audit mutation routes

Run from the template repo root:

```bash
rg -n "defineEventHandler|readBody\\(|readValidatedBody\\(|process.env" \
  layers/narduk-nuxt-layer/server apps/web/server -g '*.ts'
```

Classify every mutation route by auth model and note which ones still use raw
handlers or unvalidated bodies.

## 2. Move shared patterns into wrappers

- Add or update wrapper helpers in the shared layer.
- Keep auth, rate limit, and schema validation at the top of the route.
- Prefer one wrapper per mutation class instead of custom route logic.

## 3. Fix routes

- Replace raw mutation handlers with the wrapper that matches the route class.
- Remove duplicate validation or rate-limit code after the wrapper lands.
- Use `guardrail-exceptions.json` only for narrow temporary blockers.

## 4. Validate

```bash
pnpm run guardrails:repo
pnpm run quality:check
```
