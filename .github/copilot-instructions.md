# GitHub Copilot Instructions

Read `AGENTS.md` at the project root for the full project rules and conventions.

## User skills (`~/.skills`)

`pnpm run skills:link`, `pnpm run sync-template`, and `pnpm run update-layer`
symlink `.cursor/skills`, `.codex/skills`, `.agent/skills`, and `.github/skills`
directly to `~/.skills` for Cursor, Codex, GitHub Copilot, and Google
Antigravity. When a task fits a packaged skill there, read its `SKILL.md` and
any referenced assets before improvising.

## Architecture

- **PNPM Workspace**: The main application lives in `apps/web/`.
- **Shared Layer**: `layers/narduk-nuxt-layer/` provides standard modules,
  security middleware, and styling. Do not recreate what the layer already
  provides.
- **Examples**: Full-featured reference apps live in the companion
  `narduk-nuxt-template-examples` repository. This repo keeps only the shipped
  app plus shared infrastructure.

## Key Rules

- **Environment**: Nuxt 4 + Nuxt UI 4 deployed to Cloudflare Workers using D1
  and Drizzle ORM.
- **No Node.js in server code**: Worker routes cannot use `fs`, `path`, or Node
  `crypto`.
- **Data Fetching**: Use `useAsyncData` or `useFetch`, never raw `$fetch` in
  page `script setup`.
- **State Management**: Use `useState()` or Pinia. Never create bare module
  scope refs.
- **SEO**: Every page must call `useSeo()` and a Schema.org helper.
- **Pattern**: Thin components, thick composables.

## Build And Quality

1. Run `pnpm run build:plugins` after shared ESLint plugin changes.
2. Run `pnpm run quality` for the workspace quality gate.
3. Run `pnpm test:e2e` for the shipped app Playwright suite when needed.

## Bootstrap

- Run `pnpm run setup -- --name="..." --display="..." --url="..."` before first
  dev/build/deploy.
- Use Doppler for secrets. Do not add `.env` files.
