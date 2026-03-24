import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CommandOptions, runCommand } from './command'

/**
 * INIT.TS — Nuxt v4 Template Initialization Script (Idempotent)
 * ----------------------------------------------------------------
 * Provisions a generated starter repo into a ready-to-deploy app.
 * Safe to re-run — all steps check for existing state before making changes.
 *
 * Usage:
 *   pnpm run setup -- --name="my-app" --display="My App Name" --url="https://myapp.com"
 *
 * Re-run (repair mode — skip template remote guard wording only):
 *   pnpm run setup -- --name="my-app" --display="My App Name" --url="https://myapp.com" --repair
 *
 * What this does:
 * 1. Replaces explicit starter placeholders in known metadata/config files
 * 2. Provisions the Cloudflare D1 database (skips if exists)
 * 3. Rewrites `wrangler.json` with the D1 database ID
 * 4. Provisions Doppler project and syncs hub secrets (additive only)
 * 5. Sets Doppler CI token on GitHub (skips if token exists)
 * 6. Reports control-plane-managed analytics state and local follow-up guidance
 * 7. Generates favicon assets for apps/web/public from source SVG
 * 8. Installs git hooks, writes setup sentinels, and records template provenance
 */

// --- 1. Argument Parsing ---

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const match = arg.match(/^--([^=]+)=?(.*)$/)
    if (match) return [match[1], match[2] || true]
    return [arg, true]
  }),
) as Record<string, string | true>

const requiredArgs = ['name', 'display', 'url']
const missingArgs = requiredArgs.filter((arg) => !args[arg] || typeof args[arg] !== 'string')

if (missingArgs.length > 0) {
  console.error()
  console.error('❌ Missing arguments!')
  console.error()
  console.error('Usage example:')
  console.error(
    '  pnpm run setup -- --name="narduk-enterprises" --display="Narduk Enterprises" --url="https://nard.uk"',
  )
  console.error()
  console.error('Re-run (repair infra only):')
  console.error(
    '  pnpm run setup -- --name="narduk-enterprises" --display="Narduk Enterprises" --url="https://nard.uk" --repair',
  )
  console.error()
  console.error('Please provide: --name, --display, and --url')
  process.exit(1)
}

const APP_NAME = args.name as string
const DISPLAY_NAME = args.display as string
const SITE_URL = (args.url as string).replace(/\/$/, '') // strip trailing slash
let REPAIR_MODE = !!args.repair

// Validate APP_NAME to prevent shell injection
if (!/^[a-z0-9][a-z0-9-]*$/.test(APP_NAME)) {
  console.error(
    '❌ Invalid --name: must match /^[a-z0-9][a-z0-9-]*$/ (lowercase alphanumeric + hyphens).',
  )
  process.exit(1)
}

// Detect Doppler CLI availability
function isDopplerAvailable(): boolean {
  try {
    runCommand('doppler', ['--version'], { encoding: 'utf-8', stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}
const DOPPLER_AVAILABLE = isDopplerAvailable()

function runOutput(command: string, args: string[], options: CommandOptions = {}) {
  return runCommand(command, args, {
    encoding: options.encoding ?? 'utf-8',
    stdio: options.stdio ?? ['pipe', 'pipe', 'pipe'],
    cwd: options.cwd || ROOT_DIR,
    env: options.env,
  })
}

function runQuiet(command: string, args: string[], options: CommandOptions = {}) {
  try {
    return runOutput(command, args, options).trim()
  } catch {
    return ''
  }
}

function runInherit(command: string, args: string[], options: CommandOptions = {}) {
  return runCommand(command, args, {
    encoding: options.encoding ?? 'utf-8',
    stdio: options.stdio ?? 'inherit',
    cwd: options.cwd || ROOT_DIR,
    env: options.env,
  })
}

const APP_DERIVED_NUXT_PORT_BASE = 3200
const APP_DERIVED_NUXT_PORT_SPAN = 2000

function deriveDefaultNuxtPort(appName: string): number {
  let hash = 0

  for (const char of appName) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0
  }

  return APP_DERIVED_NUXT_PORT_BASE + (hash % APP_DERIVED_NUXT_PORT_SPAN)
}

function resolveLocalNuxtPort(): number {
  const raw = process.env.NUXT_PORT?.trim()
  if (raw) {
    const parsed = Number.parseInt(raw, 10)
    if (Number.isInteger(parsed) && parsed >= 1024 && parsed <= 65535) {
      return parsed
    }

    console.warn(`⚠️ Invalid NUXT_PORT='${raw}'. Falling back to an app-derived local port.`)
  }

  return deriveDefaultNuxtPort(APP_NAME)
}

const LOCAL_NUXT_PORT = resolveLocalNuxtPort()
const LOCAL_SITE_URL = `http://localhost:${LOCAL_NUXT_PORT}`

const STARTER_PLACEHOLDER_FILES = [
  'doppler.template.yaml',
  'package.json',
  'README.md',
  'apps/web/package.json',
  'apps/web/nuxt.config.ts',
  'apps/web/wrangler.json',
  'apps/web/public/site.webmanifest',
] as const

const STARTER_REPLACEMENTS = [
  { from: /__APP_NAME__/g, to: APP_NAME },
  { from: /__DISPLAY_NAME__/g, to: DISPLAY_NAME },
  { from: /__SITE_URL__/g, to: SITE_URL },
  {
    from: /__APP_DESCRIPTION__/g,
    to: `${DISPLAY_NAME} — powered by Nuxt 4 and Cloudflare Workers.`,
  },
] as const

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')

// --- Helper Functions ---

async function applyStarterPlaceholders(): Promise<number> {
  let changedFiles = 0

  for (const relativePath of STARTER_PLACEHOLDER_FILES) {
    const absolutePath = path.join(ROOT_DIR, relativePath)
    let original = ''

    try {
      original = await fs.readFile(absolutePath, 'utf-8')
    } catch {
      continue
    }

    let content = original
    for (const replacement of STARTER_REPLACEMENTS) {
      content = content.replace(replacement.from, replacement.to)
    }

    if (content !== original) {
      await fs.writeFile(absolutePath, content, 'utf-8')
      changedFiles += 1
    }
  }

  return changedFiles
}

/** Get existing Doppler secret names for a project/config. */
function getDopplerSecretNames(project: string, config: string): Set<string> {
  try {
    const output = runOutput('doppler', [
      'secrets',
      '--project',
      project,
      '--config',
      config,
      '--only-names',
      '--plain',
    ])
    return new Set(output.trim().split('\n').filter(Boolean))
  } catch {
    return new Set()
  }
}

// --- execution ---

async function main() {
  // Determine if there is a target (non-template) git remote available
  let hasGitRemote = false
  try {
    const remotesCheck = runOutput('git', ['remote', '-v']).trim()
    const pushLine = remotesCheck
      .split('\n')
      .find((line) => !line.includes('narduk-nuxt-template') && line.includes('(push)'))
    hasGitRemote = !!pushLine
  } catch {
    /* no git or no remotes */
  }

  // Pre-flight check: Ensure git is initialized and remote is set properly.
  // The template remote check is FATAL (pushing to the template repo is dangerous).
  // Missing git / no remote is a WARNING — Steps 6/9.5 gracefully skip when hasGitRemote is false.
  if (!REPAIR_MODE) {
    try {
      const remotesCheck = runOutput('git', ['remote', '-v']).trim()
      if (remotesCheck.includes('narduk-nuxt-template')) {
        console.error('\n❌ CRITICAL: Template repository detected.')
        console.error(
          'Run setup inside a generated starter repo or a repo created from that starter.',
        )
        console.error('\nIf you are working from the authoring workspace, export a starter first:')
        console.error('  pnpm run export:starter -- ../my-app --force')
        console.error('  cd ../my-app')
        console.error('  git init')
        console.error('  git remote add origin git@github.com:your-username/my-app.git')
        console.error('\nThen re-run your setup command there.\n')
        process.exit(1)
      }
    } catch {
      console.warn('\n⚠️  No git remote detected — GitHub secret setup will be skipped.')
      console.warn('   After adding a remote, re-run with --repair to complete those steps.\n')
    }
  }

  console.log(
    `\n🚀 Initializing: ${DISPLAY_NAME} (${APP_NAME})${REPAIR_MODE ? ' [REPAIR MODE]' : ''}`,
  )

  // Step result tracking for structured summary
  const completed: string[] = []
  const deferred: string[] = []
  const failed: string[] = []

  // 1. Targeted placeholder replacement
  console.log(`\nStep 1/8: Applying starter placeholders${REPAIR_MODE ? ' [REPAIR MODE]' : ''}...`)
  const changedFiles = await applyStarterPlaceholders()
  if (changedFiles > 0) {
    console.log(`  ✅ Updated ${changedFiles} starter metadata file(s).`)
    completed.push('Starter metadata placeholders')
  } else {
    console.log(
      '  ⏭ No starter placeholders found (already applied or running in authoring workspace).',
    )
  }

  // 2. Database Provisioning (per-app — each app gets its own D1 database)
  console.log('\nStep 2/8: Provisioning D1 Databases...')

  // If D1_DATABASE_ID is pre-provisioned by Control Plane API, skip wrangler creation
  const preProvisionedD1Id = process.env.D1_DATABASE_ID
  const preProvisionedD1Name = process.env.D1_DATABASE_NAME
  if (preProvisionedD1Id) {
    console.log(`  ⏭ D1 database pre-provisioned by Control Plane API.`)
    console.log(`  📋 Database ID: ${preProvisionedD1Id}`)
    console.log(`  📋 Database Name: ${preProvisionedD1Name || `${APP_NAME}-db`}`)
  }

  /**
   * Provision a D1 database by name. Returns the database_id or null on failure.
   * Safe to call multiple times — skips if the database already exists.
   * Uses `wrangler d1 info --json` for reliable ID parsing (avoids brittle regex on table output).
   * Note: Uses `pnpm exec wrangler` because wrangler is a workspace devDep (apps/web),
   * not hoisted to root node_modules/.bin in pnpm monorepos.
   */
  function provisionD1(name: string): string | null {
    // Use pre-provisioned ID if the name matches
    if (preProvisionedD1Id && (name === preProvisionedD1Name || name === `${APP_NAME}-db`)) {
      console.log(`  ⏭ Using pre-provisioned D1 ID for ${name}: ${preProvisionedD1Id}`)
      return preProvisionedD1Id
    }

    // Try to create first
    try {
      console.log(`  Running: pnpm exec wrangler d1 create ${name}`)
      runInherit('pnpm', ['exec', 'wrangler', 'd1', 'create', name], { cwd: ROOT_DIR })
      console.log(`  ✅ Database created: ${name}`)
    } catch (error: any) {
      const stderr = error.stderr || ''
      if (!stderr.includes('already exists')) {
        console.error(`  ❌ D1 creation failed for ${name}: ${stderr || error.message}`)
        console.error('  Are you logged into Wrangler? (wrangler login)')
        return null
      }
      console.log(`  ⏭ Database ${name} already exists.`)
    }

    // Always fetch the ID via --json for reliable parsing
    try {
      const infoOutput = runOutput('pnpm', ['exec', 'wrangler', 'd1', 'info', name, '--json'], {
        encoding: 'utf-8',
      })
      const info = JSON.parse(infoOutput)
      const dbId = info.uuid || info.database_id
      if (dbId) {
        console.log(`  📋 Database ID: ${dbId}`)
        return dbId
      }
    } catch (e: any) {
      console.error(`  ❌ Failed to fetch DB info for ${name}: ${e.message}`)
    }
    return null
  }

  // 3. Link each app to its own dedicated D1 database
  console.log('\nStep 3/8: Linking Databases to wrangler.json...')
  const appsDir = path.join(ROOT_DIR, 'apps')
  let appDirs: string[] = []
  try {
    const entries = await fs.readdir(appsDir, { withFileTypes: true })
    // Only provision databases for actual production apps, not examples.
    appDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((name) => !name.startsWith('example-'))
  } catch {
    appDirs = []
  }

  let updatedCount = 0
  for (const appDir of appDirs) {
    const wranglerPath = path.join(appsDir, appDir, 'wrangler.json')
    try {
      const wranglerContent = await fs.readFile(wranglerPath, 'utf-8')
      const parsedWrangler = JSON.parse(wranglerContent)

      // Provision a dedicated D1 database for this app using its declared database_name
      if (parsedWrangler.d1_databases && parsedWrangler.d1_databases.length > 0) {
        let declaredDbName = parsedWrangler.d1_databases[0].database_name

        // Force explicit rename in case string-replacement failed or hasn't run
        parsedWrangler.name = appDir === 'web' ? APP_NAME : `${APP_NAME}-${appDir}`

        if (declaredDbName) {
          const dbId = provisionD1(declaredDbName)
          if (dbId) {
            parsedWrangler.d1_databases[0].database_id = dbId
          } else {
            console.warn(`  ⚠️ Could not provision DB for apps/${appDir} — manual update required.`)
          }
        }
        // Remove the corrupted preview_database_id placeholder ("DB" is the binding name, not an ID).
        // Most projects use `--remote` for preview; if a real preview DB is needed, provision it separately.
        delete parsedWrangler.d1_databases[0].preview_database_id
      }

      // Only set custom domains on the primary app (web), not companion apps (examples).
      // Skip workers.dev subdomains — they don't support custom domains.
      if (appDir === 'web') {
        try {
          const urlObj = new URL(SITE_URL)
          if (urlObj.hostname.endsWith('.workers.dev')) {
            console.log(
              `  ⏭ Skipping custom domain — ${urlObj.hostname} is a workers.dev subdomain.`,
            )
          } else {
            if (!parsedWrangler.routes) {
              parsedWrangler.routes = []
            }
            const existingRoute = parsedWrangler.routes.find(
              (r: any) => r.pattern === urlObj.hostname,
            )
            if (!existingRoute) {
              parsedWrangler.routes.push({ pattern: urlObj.hostname, custom_domain: true })
            }
          }
        } catch (_e) {
          console.warn(`  ⚠️ Could not configure custom domain: Invalid SITE_URL (${SITE_URL})`)
        }
      }

      await fs.writeFile(wranglerPath, JSON.stringify(parsedWrangler, null, 2) + '\n', 'utf-8')
      updatedCount++
      console.log(`  ✅ Updated apps/${appDir}/wrangler.json`)
    } catch {
      // App doesn't have a wrangler.json — skip silently
    }
  }

  if (updatedCount === 0) {
    console.warn('  ⚠️ No wrangler.json files found in apps/*/')
    failed.push('D1 database + wrangler.json (no apps found)')
  } else {
    completed.push('D1 database provisioning')
    completed.push('wrangler.json configuration')
  }

  // 4. Doppler Registration (additive — won't clobber existing secrets)
  console.log('\nStep 4/8: Provisioning Doppler Project...')
  if (process.env.DOPPLER_PRE_PROVISIONED) {
    console.log('  ⏭ Doppler project pre-provisioned by Control Plane API.')
    completed.push('Doppler project + hub secrets (pre-provisioned)')
  } else if (!DOPPLER_AVAILABLE) {
    console.log('  ⏭ Doppler CLI not configured; skipping Doppler project provisioning.')
    console.log('     Run `doppler setup` and re-run with --repair to complete this step.')
    deferred.push('Doppler project + secrets (CLI not installed — re-run with --repair)')
  } else {
    console.log(`  Running: doppler projects create ${APP_NAME}`)
    try {
      runInherit('doppler', [
        'projects',
        'create',
        APP_NAME,
        '--description',
        `${DISPLAY_NAME} auto-provisioned`,
      ])
      console.log(`  ✅ Doppler project created: ${APP_NAME}`)
    } catch (error: any) {
      const stderr = error.stderr || ''
      if (stderr.includes('already exists')) {
        console.log(`  ⏭ Doppler project ${APP_NAME} already exists.`)
      } else {
        console.warn(`  ⚠️ Doppler creation failed: ${stderr || error.message}`)
      }
    }

    // Set hub references — overwrites stale direct values with cross-project refs
    try {
      const existing = getDopplerSecretNames(APP_NAME, 'prd')

      // Hub cross-project references (always enforce these)
      const hubRefs: Record<string, string> = {
        CLOUDFLARE_API_TOKEN: '${narduk-nuxt-template.prd.CLOUDFLARE_API_TOKEN}',
        CLOUDFLARE_ACCOUNT_ID: '${narduk-nuxt-template.prd.CLOUDFLARE_ACCOUNT_ID}',
        CONTROL_PLANE_API_KEY: '${narduk-nuxt-template.prd.CONTROL_PLANE_API_KEY}',
        GITHUB_TOKEN_PACKAGES_READ: '${narduk-nuxt-template.prd.GITHUB_TOKEN_PACKAGES_READ}',
        POSTHOG_PUBLIC_KEY: '${narduk-nuxt-template.prd.POSTHOG_PUBLIC_KEY}',
        POSTHOG_PROJECT_ID: '${narduk-nuxt-template.prd.POSTHOG_PROJECT_ID}',
        POSTHOG_HOST: '${narduk-nuxt-template.prd.POSTHOG_HOST}',
        POSTHOG_PERSONAL_API_KEY: '${narduk-nuxt-template.prd.POSTHOG_PERSONAL_API_KEY}',
        GA_ACCOUNT_ID: '${narduk-nuxt-template.prd.GA_ACCOUNT_ID}',
        GSC_SERVICE_ACCOUNT_JSON: '${narduk-nuxt-template.prd.GSC_SERVICE_ACCOUNT_JSON}',
        GSC_USER_EMAIL: '${narduk-nuxt-template.prd.GSC_USER_EMAIL}',
        APPLE_KEY_ID: '${narduk-nuxt-template.prd.APPLE_KEY_ID}',
        APPLE_SECRET_KEY: '${narduk-nuxt-template.prd.APPLE_SECRET_KEY}',
        APPLE_TEAM_ID: '${narduk-nuxt-template.prd.APPLE_TEAM_ID}',
        CSP_SCRIPT_SRC: '${narduk-nuxt-template.prd.CSP_SCRIPT_SRC}',
        CSP_CONNECT_SRC: '${narduk-nuxt-template.prd.CSP_CONNECT_SRC}',
      }

      // Per-app secrets (only set if missing — don't overwrite app-specific values)
      const appSecrets: Record<string, string> = {
        APP_NAME: APP_NAME,
        SITE_URL: SITE_URL,
      }

      // Hub refs: verify resolved value matches hub, overwrite if stale
      let hubToken = ''
      try {
        const hubJson = runOutput('doppler', [
          'secrets',
          'get',
          'CLOUDFLARE_API_TOKEN',
          '--project',
          'narduk-nuxt-template',
          '--config',
          'prd',
          '--json',
        ])
        hubToken = JSON.parse(hubJson).CLOUDFLARE_API_TOKEN?.computed || ''
      } catch {
        /* hub unavailable */
      }

      const toSet: string[] = []

      if (hubToken) {
        let spokeToken = ''
        try {
          const spokeJson = runOutput('doppler', [
            'secrets',
            'get',
            'CLOUDFLARE_API_TOKEN',
            '--project',
            APP_NAME,
            '--config',
            'prd',
            '--json',
          ])
          spokeToken = JSON.parse(spokeJson).CLOUDFLARE_API_TOKEN?.computed || ''
        } catch {
          /* not set */
        }

        if (spokeToken !== hubToken) {
          // Stale or missing — force all hub refs
          for (const [key, val] of Object.entries(hubRefs)) {
            toSet.push(`${key}=${val}`)
          }
        }
      } else {
        // Can't verify hub — only set missing refs
        for (const [key, val] of Object.entries(hubRefs)) {
          if (!existing.has(key)) toSet.push(`${key}='${val}'`)
        }
      }

      // Per-app secrets: only add if missing
      for (const [key, val] of Object.entries(appSecrets)) {
        if (!existing.has(key)) toSet.push(`${key}='${val}'`)
      }

      // CRON_SECRET: per-app random value for cron routes (e.g. cache warming)
      if (!existing.has('CRON_SECRET')) {
        const cronSecret = crypto.randomBytes(32).toString('hex')
        toSet.push(`CRON_SECRET=${cronSecret}`)
      }

      // NUXT_SESSION_PASSWORD: per-app secure random value for session encryption
      if (!existing.has('NUXT_SESSION_PASSWORD')) {
        const sessionPassword = crypto.randomBytes(32).toString('hex')
        toSet.push(`NUXT_SESSION_PASSWORD=${sessionPassword}`)
      }

      if (toSet.length > 0) {
        runInherit('doppler', [...toSet, '--project', APP_NAME, '--config', 'prd'])
        console.log(
          `  ✅ Synced ${toSet.length} credentials (prd): ${toSet.map((s) => s.split('=')[0]).join(', ')}`,
        )
      } else {
        console.log(`  ⏭ All prd credentials correctly configured (hub references verified).`)
      }

      // Mirror secrets to dev config so local development works immediately.
      // Override SITE_URL to localhost for dev environment.
      const devSet = toSet.map((s) => {
        if (s.startsWith('SITE_URL=')) return `SITE_URL=${LOCAL_SITE_URL}`
        return s
      })
      // Ensure SITE_URL is always present in dev even if it wasn't in the prd toSet
      if (!devSet.some((s) => s.startsWith('SITE_URL='))) {
        devSet.push(`SITE_URL=${LOCAL_SITE_URL}`)
      }
      if (!devSet.some((s) => s.startsWith('NUXT_PORT='))) {
        devSet.push(`NUXT_PORT=${LOCAL_NUXT_PORT}`)
      }
      if (devSet.length > 0) {
        try {
          runInherit('doppler', [...devSet, '--project', APP_NAME, '--config', 'dev'])
          console.log(
            `  ✅ Synced ${devSet.length} credentials (dev): ${devSet.map((s) => s.split('=')[0]).join(', ')}`,
          )
        } catch (devError: any) {
          console.warn(`  ⚠️ Failed to sync dev config: ${devError.message}`)
        }
      }

      // When prd was already in sync, toSet is empty and the dev mirror above only adds SITE_URL.
      // Local `doppler run` uses `dev`, so MapKit and other hub-backed keys never appear — backfill.
      try {
        const devExisting = getDopplerSecretNames(APP_NAME, 'dev')
        const devBackfill: string[] = []
        if (!devExisting.has('SITE_URL')) {
          devBackfill.push(`SITE_URL=${LOCAL_SITE_URL}`)
        }
        if (!devExisting.has('NUXT_PORT')) {
          devBackfill.push(`NUXT_PORT=${LOCAL_NUXT_PORT}`)
        }
        for (const [key, val] of Object.entries(hubRefs)) {
          if (!devExisting.has(key)) {
            devBackfill.push(`${key}=${val}`)
          }
        }
        if (devBackfill.length > 0) {
          runInherit('doppler', [...devBackfill, '--project', APP_NAME, '--config', 'dev'])
          console.log(
            `  ✅ Backfilled ${devBackfill.length} hub reference(s) into dev: ${devBackfill.map((s) => s.slice(0, s.indexOf('='))).join(', ')}`,
          )
        }
      } catch (backfillError: any) {
        console.warn(`  ⚠️ Failed to backfill dev hub references: ${backfillError.message}`)
      }
    } catch (error: any) {
      console.warn(`  ⚠️ Failed to sync hub credentials: ${error.message}`)
      failed.push('Doppler hub secret sync')
    }
    completed.push('Doppler project + hub secrets')
  }

  // 5. Doppler Service Token → GitHub Secret (skip if token exists)
  console.log('\nStep 5/8: Adding Doppler token to GitHub repository...')
  if (process.env.DOPPLER_PRE_PROVISIONED) {
    console.log('  ⏭ Doppler token + GitHub secrets pre-provisioned by Control Plane API.')
    completed.push('GitHub DOPPLER_TOKEN secret (pre-provisioned)')
  } else if (!DOPPLER_AVAILABLE) {
    console.log('  ⏭ Doppler CLI not configured; skipping GitHub secret setup.')
    console.log('     Run `doppler setup` and re-run with --repair to complete this step.')
    deferred.push('GitHub DOPPLER_TOKEN secret (needs Doppler)')
  } else {
    if (!hasGitRemote) {
      console.log('  ⏭ No git remote found (expected for fresh scaffolds).')
      console.log('    After adding a remote, re-run with --repair to set the GitHub secret.')
      console.log(
        '    ⚠️  Deploy will fail on push to main until DOPPLER_TOKEN is set; run setup with --repair after adding your remote.',
      )
      deferred.push(
        'GitHub DOPPLER_TOKEN secret (no git remote — re-run with --repair after adding remote)',
      )
    } else {
      try {
        // Check if ci-deploy token already exists
        let tokenExists = false
        try {
          const tokensOutput = runOutput('doppler', [
            'configs',
            'tokens',
            '--project',
            APP_NAME,
            '--config',
            'prd',
            '--plain',
          ])
          tokenExists = tokensOutput.includes('ci-deploy')
        } catch {
          // If listing fails, proceed with creation attempt
        }

        if (tokenExists) {
          console.log(
            `  ⏭ ci-deploy token already exists. Skipping to avoid invalidating active CI token.`,
          )
        } else {
          const dopplerToken = runOutput('doppler', [
            'configs',
            'tokens',
            'create',
            'ci-deploy',
            '--project',
            APP_NAME,
            '--config',
            'prd',
            '--plain',
          ]).trim()

          if (!dopplerToken) {
            throw new Error('Doppler returned an empty token.')
          }

          // Automatically determine the target GitHub repository (excluding narduk-nuxt-template)
          let targetRepoFlag = ''
          try {
            const remotesOutput = runOutput('git', ['remote', '-v'])
            const remotes = remotesOutput.split('\n').filter(Boolean)
            const targetRemoteLine = remotes.find(
              (line) => !line.includes('narduk-nuxt-template') && line.includes('(push)'),
            )
            if (targetRemoteLine) {
              let url = targetRemoteLine.split(/\s+/)[1]
              if (url) {
                url = url.replace(/^(https?:\/\/|git@)/, '')
                url = url.replace(/^github\.com[:/]/, '')
                url = url.replace(/\.git$/, '')
                if (url) {
                  targetRepoFlag = `--repo=${url}`
                  console.log(`  🎯 Automatically selected GitHub repository for secrets: ${url}`)
                }
              }
            }
          } catch {
            // Fallback to default gh cli behavior if parsing fails
          }

          // Upload to GitHub as a repository secret via gh CLI
          runInherit('gh', [
            'secret',
            'set',
            'DOPPLER_TOKEN',
            ...(targetRepoFlag ? [targetRepoFlag] : []),
            '--body',
            dopplerToken,
          ])
          console.log(`  ✅ DOPPLER_TOKEN set as GitHub Actions secret.`)
          completed.push('GitHub DOPPLER_TOKEN secret')
        }
      } catch (error: any) {
        const stderr = error.stderr || error.message || ''
        if (stderr.includes('token') && stderr.includes('already exists')) {
          console.log(`  ⏭ Doppler CI token already exists. Skipping.`)
          completed.push('GitHub DOPPLER_TOKEN secret')
        } else {
          console.warn(`  ⚠️ Failed to set DOPPLER_TOKEN on GitHub: ${stderr}`)
          console.warn('  Ensure you are logged into gh (gh auth login) and have a git remote set.')
          failed.push('GitHub DOPPLER_TOKEN secret')
        }
      }
    }
  }

  // 5.5. Local Doppler Setup (skip if in CI)
  console.log('\nStep 5.5/8: Configuring local Doppler environment...')

  // Write doppler.yaml for local development convenience.
  // Note: this file is gitignored and must be recreated by each developer.
  const dopplerYamlPath = path.join(ROOT_DIR, 'doppler.yaml')
  try {
    await fs.writeFile(dopplerYamlPath, `setup:\n  project: ${APP_NAME}\n  config: dev\n`, 'utf-8')
    console.log(`  ✅ Created doppler.yaml (project=${APP_NAME}, config=dev)`)
  } catch (error: any) {
    console.warn(`  ⚠️ Failed to explicitly write doppler.yaml: ${error.message}`)
  }

  if (!DOPPLER_AVAILABLE) {
    console.log('  ⏭ Doppler CLI not configured; skipping local setup command.')
  } else if (process.env.CI) {
    console.log('  ⏭ Running in CI; skipping local Doppler setup command.')
  } else {
    try {
      runInherit('doppler', ['setup', '--project', APP_NAME, '--config', 'dev'])
      console.log(`  ✅ Local Doppler environment configured for project: ${APP_NAME} (dev config)`)
      completed.push('Local Doppler environment')
    } catch (error: any) {
      const stderr = error.stderr || error.message || ''
      console.warn(`  ⚠️ Failed to configure local Doppler environment: ${stderr}`)
      failed.push('Local Doppler environment')
    }
  }

  // 6. Analytics Provisioning (each service internally skips if already configured)
  console.log('\nStep 6/8: Control-plane managed analytics...')
  if (process.env.GA_PROPERTY_ID && process.env.GA_MEASUREMENT_ID) {
    console.log('  ⏭ GA4 pre-provisioned by Control Plane API.')
    console.log(`  📋 Property ID: ${process.env.GA_PROPERTY_ID}`)
    console.log(`  📋 Measurement ID: ${process.env.GA_MEASUREMENT_ID}`)
    if (process.env.INDEXNOW_KEY) {
      console.log(`  📋 IndexNow Key: ${process.env.INDEXNOW_KEY}`)
    }
    completed.push('Analytics provisioning (control plane)')
  } else {
    console.log('  ⏭ Initial GA4, GSC, and IndexNow provisioning is handled by the control plane.')
    console.log('     The template setup script no longer provisions analytics directly.')
    console.log(
      `     If GSC ownership still needs to be finalized after deploy, run: doppler run --project ${APP_NAME} --config prd -- pnpm exec tsx tools/gsc-verify.ts`,
    )
    deferred.push('Analytics provisioning (use control plane)')
  }

  // 7. Generate Favicons for apps/web
  console.log('\nStep 7/8: Generating favicon assets for apps/web...')
  try {
    const webPublicDir = path.join(ROOT_DIR, 'apps', 'web', 'public')
    const webFaviconSvg = path.join(webPublicDir, 'favicon.svg')
    if (
      await fs
        .stat(webFaviconSvg)
        .then(() => true)
        .catch(() => false)
    ) {
      console.log('  Installing ephemeral dependencies (sharp)...')
      runInherit('pnpm', ['add', '-w', '--save-dev', 'sharp'])

      runInherit(
        'pnpm',
        [
          'exec',
          'tsx',
          'tools/generate-favicons.ts',
          `--target=apps/web/public`,
          `--name=${DISPLAY_NAME}`,
          `--short-name=${DISPLAY_NAME.slice(0, 12)}`,
        ],
        {
          cwd: ROOT_DIR,
        },
      )
      console.log('  ✅ Favicon assets generated for apps/web.')
    } else {
      console.log('  ⏭ No favicon.svg found in apps/web/public. Skipping.')
      console.log('    Run the /generate-branding workflow to create branding assets.')
    }
  } catch (error: any) {
    console.warn(`  ⚠️ Favicon generation failed: ${error.message}`)
    console.warn('    Run manually: pnpm generate:favicons -- --target=apps/web/public')
  }

  console.log('\nStep 8/8: Installing git hooks and finalizing setup...')
  try {
    runInherit('git', ['config', 'core.hooksPath', '.githooks'], { cwd: ROOT_DIR })
    console.log('  ✅ git core.hooksPath set to .githooks')
    completed.push('Git hooks')
  } catch (error: any) {
    console.warn(`  ⚠️ Could not install git hooks: ${error.message}`)
    deferred.push('Git hooks (run: git config core.hooksPath .githooks)')
  }

  // Write the bootstrap sentinel so pre* hooks allow dev/build/deploy
  await fs.writeFile(
    path.join(ROOT_DIR, '.setup-complete'),
    `initialized=${new Date().toISOString()}\napp=${APP_NAME}\n`,
    'utf-8',
  )

  // Record the template SHA this app was spawned from (used by drift detection in CI)
  let templateSha = ''
  try {
    templateSha = runOutput('git', ['rev-parse', 'HEAD'], { cwd: ROOT_DIR }).trim()
  } catch {
    /* pre-init state — no commits yet */
  }

  const templateVersionContent = [
    `sha=${templateSha || 'unknown'}`,
    `template=narduk-nuxt-template`,
    `spawned=${new Date().toISOString()}`,
    `app=${APP_NAME}`,
    '',
  ].join('\n')
  await fs.writeFile(path.join(ROOT_DIR, '.template-version'), templateVersionContent, 'utf-8')

  console.log('\nSetup complete.')

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  SETUP SUMMARY')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  completed.forEach((s) => console.log(`  ✅ ${s}`))
  if (deferred.length > 0) {
    console.log()
    deferred.forEach((s) => console.log(`  ⏭  ${s}`))
  }
  if (failed.length > 0) {
    console.log()
    failed.forEach((s) => console.log(`  ❌ ${s}`))
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (failed.length > 0) {
    console.log('\n⚠️  Some steps failed — review the errors above.')
  } else if (deferred.length > 0) {
    console.log('\n🎉 Setup succeeded! Some optional steps were deferred (see ⏭ above).')
  } else {
    console.log('\n🎉 All steps completed successfully!')
  }

  console.log('\nNext steps:')
  console.log(`  1. pnpm run validate        # Confirm infrastructure`)
  console.log(`  2. pnpm run db:migrate      # Apply shared layer + app schema to local D1`)
  console.log(`  3. doppler run -- pnpm dev  # Start dev server on ${LOCAL_SITE_URL}`)
  console.log(
    `  4. Mint AGENT_ADMIN_API_KEY via /api/auth/api-keys once an admin account exists; store the raw nk_... token in Doppler for agent/admin automation`,
  )
  if (!hasGitRemote) {
    console.log(`\n  ⚠️  DEPLOYMENT BLOCKED: Add a git remote and re-run with --repair:`)
    console.log(
      `     pnpm run setup -- --name="${APP_NAME}" --display="${DISPLAY_NAME}" --url="${SITE_URL}" --repair`,
    )
  }
  console.log()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
