import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getCanonicalCiContent } from './sync-manifest'

export const STARTER_COPY_FILES = [
  '.editorconfig',
  '.gitignore',
  '.npmrc',
  '.prettierignore',
  'doppler.template.yaml',
  'guardrail-exceptions.json',
  'pnpm-workspace.yaml',
  'prettier.config.mjs',
  'renovate.json',
  'turbo.json',
  '.github/prompts/ui-ux-pro-max/PROMPT.md',
  '.githooks/pre-commit',
  '.githooks/post-checkout',
  '.githooks/post-merge',
  '.agent/skills',
  '.cursor/skills',
  '.codex/skills',
  '.claude/skills',
  '.github/skills',
  'scripts/dev-kill.sh',
  'scripts/cleanup-node-leaks.sh',
  'tools/install-git-hooks.cjs',
  'tools/command.ts',
  'tools/gsc-verify.ts',
  'tools/update-layer.ts',
  'tools/validate.ts',

  'tools/check-guardrails.ts',
  'tools/sync-template.ts',
  'tools/sync-core.ts',
  'tools/ensure-skills-links.ts',
  'tools/sync-manifest.ts',
  'tools/check-drift-ci.ts',
  'tools/check-sync-health.ts',
  'tools/generate-favicons.ts',
  'tools/tail.ts',
  'tools/ship.ts',
  'tools/db-migrate.sh',
  'tools/check-setup.cjs',
  '.cursor/rules/user-global-skills.mdc',
  'apps/web/.nuxtrc',
  'apps/web/.npmrc',
  'apps/web/eslint.config.mjs',
  'apps/web/drizzle.config.ts',
  'apps/web/tsconfig.json',
] as const

export const STARTER_COPY_DIRECTORIES = [
  '.agents/workflows',
  '.template-reference',
  'apps/web/app',
  'apps/web/drizzle',
  'apps/web/public',
  'apps/web/server',
  'apps/web/tests',
  'docs',
  'layers/narduk-nuxt-layer',
  'packages/eslint-config',
  'tools/guardrails',
] as const

export const STARTER_SKIP_NAMES = new Set([
  '.DS_Store',
  '.data',
  '.nuxt',
  '.output',
  '.nitro',
  '.turbo',
  '.wrangler',
  'artifacts',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
])

export const STARTER_SKIP_RELATIVE_PATHS = new Set([
  '.setup-complete',
  '.template-version',
  'doppler.json',
  'doppler.yaml',
  'apps/web/.env',
  'apps/web/.wrangler',
])

export const STARTER_APP_NAME_PLACEHOLDER = '__APP_NAME__'
export const STARTER_DISPLAY_NAME_PLACEHOLDER = '__DISPLAY_NAME__'
export const STARTER_SITE_URL_PLACEHOLDER = '__SITE_URL__'
export const STARTER_APP_DESCRIPTION_PLACEHOLDER = '__APP_DESCRIPTION__'

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T
}

export function createStarterRootPackage(templateRoot: string): string {
  const pkg = readJson<Record<string, any>>(join(templateRoot, 'package.json'))

  pkg.name = STARTER_APP_NAME_PLACEHOLDER
  pkg.scripts = {
    postinstall:
      "node -e \"if(!require('fs').existsSync('.setup-complete'))console.log('\\n⚠️  This repo is incomplete until the control plane finishes provisioning (writes .setup-complete). See your platform docs.\\n')\"",
    predev: 'node tools/check-setup.cjs',
    dev: 'pnpm --filter web dev',
    prebuild: 'node tools/check-setup.cjs',
    build: 'doppler run -- pnpm -r build',
    'build:plugins': 'pnpm --filter @narduk/eslint-config build',
    preship:
      'node tools/check-setup.cjs && pnpm install --frozen-lockfile && pnpm exec tsx tools/check-drift-ci.ts && pnpm exec tsx tools/check-sync-health.ts && pnpm run quality:check && pnpm -r --if-present test:unit',
    ship: 'pnpm exec tsx tools/ship.ts',
    prelint: 'pnpm run build:plugins',
    lint: 'turbo run lint',
    typecheck: 'turbo run typecheck',
    'hooks:install': 'node tools/install-git-hooks.cjs',
    'guardrails:repo': 'pnpm exec tsx tools/check-guardrails.ts',
    quality: 'pnpm run quality:fix && pnpm run quality:check',
    'quality:check': "pnpm run guardrails:repo && turbo run quality --filter='./apps/*'",
    'quality:fix': 'turbo run lint --force -- --fix && pnpm run format',
    check: 'pnpm run quality:check',
    setup: 'pnpm run skills:link',
    'update-layer': 'pnpm exec tsx tools/update-layer.ts',
    'sync-template': 'pnpm exec tsx tools/sync-template.ts .',
    'skills:link': 'pnpm exec tsx tools/ensure-skills-links.ts',
    validate: 'pnpm exec tsx tools/validate.ts',
    'check:sync-health': 'pnpm exec tsx tools/check-sync-health.ts',
    clean:
      "find . -type d \\( -name node_modules -o -name .nuxt -o -name .output -o -name .nitro -o -name .wrangler -o -name .turbo -o -name .data -o -name dist \\) -not -path './.git/*' -prune -exec rm -rf {} +",
    'clean:install': 'pnpm run clean && pnpm install && pnpm --filter web run db:ready',
    'db:migrate': 'pnpm --filter web run db:migrate',
    'dev:kill': 'sh scripts/dev-kill.sh',
    'cleanup:node-leaks': 'sh scripts/cleanup-node-leaks.sh',
    'test:e2e': 'playwright test',
    'test:e2e:web': 'pnpm --filter web test:e2e',
    'generate:favicons': 'pnpm exec tsx tools/generate-favicons.ts',
    format: 'prettier --write "**/*.{ts,mts,vue,js,mjs,json,yaml,yml,css,md}"',
    'format:check': 'prettier --check "**/*.{ts,mts,vue,js,mjs,json,yaml,yml,css,md}"',
  }

  return JSON.stringify(pkg, null, 2) + '\n'
}

export function createStarterWebPackage(templateRoot: string): string {
  const pkg = readJson<Record<string, any>>(join(templateRoot, 'apps/web/package.json'))

  pkg.name = 'web'
  for (const scriptName of ['db:migrate', 'db:seed', 'db:reset']) {
    const current = pkg.scripts?.[scriptName]
    if (typeof current === 'string') {
      pkg.scripts[scriptName] = current.replace(
        /narduk-nuxt-template-db/g,
        `${STARTER_APP_NAME_PLACEHOLDER}-db`,
      )
    }
  }

  return JSON.stringify(pkg, null, 2) + '\n'
}

export function createStarterWebWrangler(templateRoot: string): string {
  const wrangler = readJson<Record<string, any>>(join(templateRoot, 'apps/web/wrangler.json'))

  wrangler.name = STARTER_APP_NAME_PLACEHOLDER
  if (Array.isArray(wrangler.d1_databases) && wrangler.d1_databases[0]) {
    wrangler.d1_databases[0].database_name = `${STARTER_APP_NAME_PLACEHOLDER}-db`
    wrangler.d1_databases[0].database_id = ''
    delete wrangler.d1_databases[0].preview_database_id
  }

  return JSON.stringify(wrangler, null, 2) + '\n'
}

export function createStarterWebManifest(templateRoot: string): string {
  const manifest = readJson<Record<string, any>>(
    join(templateRoot, 'apps/web/public/site.webmanifest'),
  )

  manifest.name = STARTER_DISPLAY_NAME_PLACEHOLDER
  manifest.short_name = STARTER_DISPLAY_NAME_PLACEHOLDER

  return JSON.stringify(manifest, null, 2) + '\n'
}

export function createStarterWebNuxtConfig(templateRoot: string): string {
  return readFileSync(join(templateRoot, 'apps/web/nuxt.config.ts'), 'utf-8')
    .replaceAll("'Nuxt 4 Demo'", `'${STARTER_DISPLAY_NAME_PLACEHOLDER}'`)
    .replace(
      "'A production-ready demo template showcasing Nuxt 4, Nuxt UI 4, Tailwind CSS 4, and Cloudflare Workers with D1 database.'",
      `'${STARTER_APP_DESCRIPTION_PLACEHOLDER}'`,
    )
}

export function createStarterCiWorkflow(): string {
  return getCanonicalCiContent()
}
