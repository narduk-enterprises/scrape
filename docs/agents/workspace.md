# Workspace Guide

## Repository Identity

This repository is the template itself. If you are building a downstream app,
create and use a separate repository before writing app code. Do not push
derived app work back to `narduk-enterprises/narduk-nuxt-template`.

Treat this repository as the **authoring workspace**. Generate or clone a clean
starter surface for downstream apps instead of deleting authoring-only files
after bootstrap.

The workspace currently ships:

- `apps/web/` as the main application
- `apps/showcase/` as the template demo and reference app
- `layers/narduk-nuxt-layer/` as the shared Nuxt layer
- `packages/eslint-config/` as the shared ESLint package
- `tools/` as local Node.js automation
- `scripts/` as shell helpers such as `dev-kill.sh` and `cleanup-node-leaks.sh`

Full example apps have moved to the companion repository
[`narduk-nuxt-template-examples`](https://github.com/narduk-enterprises/narduk-nuxt-template-examples).

## Starter Surface

The downstream starter is intentionally narrower than this workspace. It keeps
`apps/web`, the shared layer, shared ESLint packages, setup/sync tooling, and
downstream docs, but excludes `apps/showcase` and other authoring-only scripts.

Generate a local starter export with:

```bash
pnpm run export:starter -- ../my-app --force
```

## Glossary

| Term          | Meaning                                                                         |
| ------------- | ------------------------------------------------------------------------------- |
| Layer         | Shared Nuxt layer in `layers/narduk-nuxt-layer/` consumed by apps via `extends` |
| Package       | Workspace package such as `packages/eslint-config/`                             |
| Isolate       | Cloudflare Worker V8 isolate with no shared in-memory state across requests     |
| Per-isolate   | State that exists only inside one Worker isolate instance                       |
| Hub project   | Doppler project that owns shared infrastructure or analytics secrets            |
| Spoke project | Doppler project for a single derived app that references hub secrets            |

## Where Code Goes

| Area                        | Use it for                                | Avoid                               |
| --------------------------- | ----------------------------------------- | ----------------------------------- |
| `apps/web/`                 | Product-specific app work                 | Rebuilding layer features           |
| `apps/showcase/`            | Template demos, smoke flows, reference UI | Treating it as the main shipped app |
| `layers/narduk-nuxt-layer/` | Reusable functionality for all apps       | One-off app behavior                |
| `packages/eslint-config/`   | Shared lint rules and plugins             | App-only lint overrides             |
| `tools/`                    | Local or CI automation in Node.js         | Edge runtime code                   |
| `scripts/`                  | Shell convenience scripts                 | TypeScript automation               |

## Layer Inventory

Before adding a new file in `apps/web/`, check whether the layer already
provides it.

| Category      | Provided by layer                                                       |
| ------------- | ----------------------------------------------------------------------- |
| Modules       | `@nuxt/ui`, `@nuxt/fonts`, `@nuxt/image`, `@nuxtjs/seo`, `@nuxt/eslint` |
| App shell     | `app/app.vue`, `app/app.config.ts`, branded `app/error.vue`             |
| SEO           | `useSeo`, `useSchemaOrg`, OG image components                           |
| UI helpers    | `AppTabs`, `usePersistentTab`, base CSS utilities                       |
| Analytics     | `gtag.client.ts`, `posthog.client.ts`, `usePosthog`                     |
| Security      | CORS, CSRF, security headers, per-isolate rate limiter                  |
| Data and auth | D1 helpers, Drizzle schema, auth helpers, KV and R2 helpers             |
| Server routes | `/api/health`, IndexNow routes, admin GA and GSC routes                 |

If the feature belongs in every app, add it to the layer. If it belongs only to
the current application, keep it in `apps/web/`.

## Showcase App

`apps/showcase/` is a demo surface for the template. Use it to:

- exercise shared layer capabilities
- keep smoke-testable reference flows
- demonstrate reusable UI patterns

Do not treat showcase as a production downstream app. Keep its content generic
enough to remain useful as template documentation.

## Updating The Layer

When a downstream app needs the latest layer changes, use the local sync flow:

```bash
pnpm run update-layer
```

By default, local sync refuses to run on a dirty downstream worktree. Use
`--allow-dirty-app` only when you intentionally want to sync on top of local
uncommitted work.

What the sync flow does:

1. Uses a local checkout of `narduk-nuxt-template` as the source of truth.
2. Copies `layers/narduk-nuxt-layer/` into the downstream app.
3. Rewrites the vendored layer `repository.url` to match the downstream app.
4. Applies canonical pnpm config.
5. Runs `pnpm install`.
6. Repairs `.agent/skills`, `.cursor/skills`, `.codex/skills`, `.claude/skills`,
   and `.github/skills` so they all point at the repo-local `.agents/skills`
   tree via `pnpm run skills:link`.

For full template syncs across local fleet clones, use:

```bash
pnpm run sync-template ~/new-code/your-app
pnpm run sync:fleet
```

## Fleet Theme And Tailwind Hygiene

When editing fleet clones under `FLEET_APPS_DIR`:

- Keep the body baseline aligned with the layer defaults.
- Do not generate dynamic Tailwind class names such as `` `text-${variant}` ``.
- Avoid low-contrast `from-default` to `to-muted` gradients on large surfaces.
- Prefer semantic tokens and `@theme` over raw hex in app CSS.

Audit command:

```bash
pnpm run audit:fleet-themes
```

Add `--hex` to list raw hex values and `--strict` if those hits should fail.

## Workflow Inventory

Slash-command workflow definitions live in `.agents/workflows/`.

| Workflow                      | Purpose                                                                    |
| ----------------------------- | -------------------------------------------------------------------------- |
| `/audit-component-complexity` | Finds oversized components and thin-component violations                   |
| `/audit-nuxt-ui-4`            | Nuxt UI 4 usage audit                                                      |
| `/audit-state-patterns`       | Reviews composable, store, and state boundaries                            |
| `/audit-tailwind-nuxt-ui`     | Tailwind token and Nuxt UI styling audit                                   |
| `/burn-down-exceptions`       | Reviews tracked guardrail exceptions                                       |
| `/check-ssr-hydration-safety` | SSR safety, DOM access, and hydration guards                               |
| `/check-ui-styling`           | Tailwind v4 CSS order, token use, and Nuxt UI patterns                     |
| `/deploy`                     | Local deploy workflow with dirty-repo guard                                |
| `/enhance-design-system`      | UI system enhancement using the canonical skill bundle                     |
| `/enhance-mega`               | Larger UI overhaul workflow                                                |
| `/enhance-ui-ux`              | Targeted UI and UX enhancement workflow                                    |
| `/generate-app-idea`          | New app ideation                                                           |
| `/generate-brand-identity`    | Brand identity generation                                                  |
| `/harden-mutations`           | Mutation hardening with wrappers, auth, rate limits, and schema validation |
| `/nuxt-check-fix-2`           | General Nuxt repo audit and fix workflow                                   |
| `/release-shared-guardrails`  | Shared-package release and fleet rollout                                   |
| `/repair-fleet-guardrails`    | Fleet guardrail repair and resync                                          |
| `/review-cloudflare-layer`    | Review the Nuxt layer plus Cloudflare setup                                |
| `/score-repo`                 | Broad repo audit with scoring                                              |
| `/sync-fleet`                 | Sync template changes across local fleet clones                            |
| `/worker-runtime-hygiene`     | Search for Worker-runtime hazards                                          |
| `/zero-warnings-efficiency`   | Warning cleanup and quality sweep                                          |

## Build Pipeline

The monorepo uses Turborepo for orchestration.

```text
quality <- lint + typecheck
lint    <- build:plugins
build   <- ^build
deploy  <- build
```

Common commands:

- `pnpm run quality`
- `pnpm run dev`
- `pnpm run dev:workspace`
- `pnpm run dev:showcase`
- `pnpm run build:plugins`
