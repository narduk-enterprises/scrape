import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runCommand } from './command'

const DEFAULT_CONTROL_PLANE_URL = 'https://control-plane.nard.uk'

interface WranglerRouteConfig {
  pattern?: string
  custom_domain?: boolean
}

interface WranglerConfig {
  name?: string
  routes?: Array<string | WranglerRouteConfig>
}

function run(command: string, args: string[] = [], cwd = process.cwd()) {
  console.log(`\n> ${command} ${args.join(' ')}`.trim())
  runCommand(command, args, { stdio: 'inherit', cwd })
}

function runQuiet(command: string, args: string[] = [], cwd = process.cwd()) {
  try {
    return runCommand(command, args, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      cwd,
    }).trim()
  } catch (e) {
    return ''
  }
}

function tokenizeCommand(command: string): string[] {
  const tokens = command.match(/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^\s"']+)/g)
  if (!tokens) return []

  return tokens.map((token) => {
    if (token.startsWith('"') && token.endsWith('"')) {
      return token.slice(1, -1)
    }
    if (token.startsWith("'") && token.endsWith("'")) {
      return token.slice(1, -1)
    }
    return token
  })
}

function parseMigrateCommand(rawCommand: string): string[] {
  if (/[;&|`$<>]/.test(rawCommand)) {
    throw new Error(`Unsafe db:migrate script: ${rawCommand}`)
  }

  const tokens = tokenizeCommand(rawCommand)
  if (tokens.length === 0) {
    throw new Error('Empty db:migrate script.')
  }

  return tokens
}

function buildFleetSyncUrl(baseUrl: string, appName: string): string | null {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(appName)) {
    return null
  }

  try {
    const parsed = new URL(baseUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null

    const basePath = (parsed.pathname || '').replace(/\/$/, '')
    const path = `${basePath}/api/fleet/apps/${encodeURIComponent(appName)}`
    return `${parsed.origin}${path}`
  } catch {
    return null
  }
}

function normalizeValue(value: string | null | undefined): string {
  return value?.trim() || ''
}

function readWranglerConfig(appDir: string): WranglerConfig | null {
  const wranglerPath = resolve(appDir, 'wrangler.json')
  if (!existsSync(wranglerPath)) return null

  try {
    return JSON.parse(readFileSync(wranglerPath, 'utf8')) as WranglerConfig
  } catch {
    return null
  }
}

function readDopplerSecret(appDir: string, secretName: string, projectHints: string[]): string {
  const uniqueHints = [...new Set(projectHints.map((hint) => normalizeValue(hint)).filter(Boolean))]

  for (const project of uniqueHints) {
    const value = runQuiet(
      'doppler',
      ['secrets', 'get', secretName, '--project', project, '--config', 'prd', '--plain'],
      appDir,
    )
    if (value) return value
  }

  return runQuiet('doppler', ['secrets', 'get', secretName, '--plain'], appDir)
}

function routePatternToUrl(pattern: string): string {
  const normalized = normalizeValue(pattern)
    .replace(/\/\*.*$/, '')
    .replace(/\*.*$/, '')
    .replace(/\/$/, '')
  if (!normalized) return ''
  if (normalized.includes('*')) return ''

  const candidate = normalized.includes('://') ? normalized : `https://${normalized}`

  try {
    const parsed = new URL(candidate)
    return `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}`
  } catch {
    return ''
  }
}

function inferSiteUrlFromWrangler(wranglerConfig: WranglerConfig | null): string {
  const routes = wranglerConfig?.routes
  if (!Array.isArray(routes)) return ''

  for (const route of routes) {
    if (typeof route === 'string') {
      const inferred = routePatternToUrl(route)
      if (inferred) return inferred
      continue
    }

    if (!route || typeof route !== 'object') continue
    const inferred = routePatternToUrl(route.pattern || '')
    if (inferred) return inferred
  }

  return ''
}

function resolveFleetSyncContext(appTarget: string, appDir: string) {
  const wranglerConfig = readWranglerConfig(appDir)
  const workerName = normalizeValue(wranglerConfig?.name) || appTarget
  const projectHints = [process.env.APP_NAME, workerName, appTarget]
  const appName =
    normalizeValue(process.env.APP_NAME) ||
    readDopplerSecret(appDir, 'APP_NAME', projectHints) ||
    workerName
  const siteUrl =
    normalizeValue(process.env.SITE_URL) ||
    readDopplerSecret(appDir, 'SITE_URL', [appName, workerName, appTarget]) ||
    inferSiteUrlFromWrangler(wranglerConfig)
  const controlPlaneUrl =
    normalizeValue(process.env.CONTROL_PLANE_URL) ||
    readDopplerSecret(appDir, 'CONTROL_PLANE_URL', [appName, workerName, appTarget]) ||
    (appName === 'control-plane' ? siteUrl : '') ||
    DEFAULT_CONTROL_PLANE_URL
  const fleetApiKey =
    normalizeValue(process.env.CONTROL_PLANE_API_KEY) ||
    normalizeValue(process.env.FLEET_API_KEY) ||
    normalizeValue(process.env.AGENT_ADMIN_API_KEY) ||
    readDopplerSecret(appDir, 'CONTROL_PLANE_API_KEY', [appName, workerName, appTarget]) ||
    readDopplerSecret(appDir, 'FLEET_API_KEY', [appName, workerName, appTarget]) ||
    readDopplerSecret(appDir, 'AGENT_ADMIN_API_KEY', [appName, workerName, appTarget])

  return {
    appName,
    siteUrl,
    controlPlaneUrl,
    fleetApiKey,
  }
}

async function shipApp(appTarget: string) {
  // Find target directory
  let appDir = resolve(process.cwd(), 'apps', appTarget)
  if (!existsSync(appDir)) {
    appDir = resolve(process.cwd(), 'packages', appTarget)
    if (!existsSync(appDir)) {
      console.error(`❌ Target directory for ${appTarget} does not exist in apps/ or packages/`)
      process.exit(1)
    }
  }

  const pkgPath = resolve(appDir, 'package.json')
  let hasMigrate = false
  let pkg
  if (existsSync(pkgPath)) {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    if (pkg.scripts && pkg.scripts['db:migrate']) {
      hasMigrate = true
    }
  }

  // 1. Build Verification
  console.log(`\n🏗️ Building ${appTarget}...`)
  try {
    run('doppler', ['run', '--', 'pnpm', 'run', 'build'], appDir)
  } catch (error) {
    console.error(`\n❌ Build failed for ${appTarget}. Aborting ship to prevent broken commit.`)
    process.exit(1)
  }

  // 2. Git operations
  console.log(`\n📦 Checking git status...`)
  run('git', ['add', '-A'], appDir)

  let hasChanges = false
  try {
    runCommand('git', ['diff', '--cached', '--quiet'], { cwd: appDir })
  } catch (e) {
    hasChanges = true
  }

  if (hasChanges) {
    const date = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
    run('git', ['commit', '-m', `chore: ship ${date}`], appDir)
  } else {
    console.log('No changes to commit.')
  }

  console.log(`\n🔄 Fetching remote...`)
  run('git', ['fetch'], appDir)
  try {
    runCommand('git', ['merge-base', '--is-ancestor', '@{u}', 'HEAD'], { cwd: appDir })
  } catch (e) {
    console.error(
      '\n❌ Remote has changes not in local branch. Run: git pull --rebase && pnpm ship\n',
    )
    process.exit(1)
  }

  console.log(`\n🚀 Pushing to remote...`)
  run('git', ['push'], appDir)

  // 3. Remote Migrations
  if (hasMigrate && pkg) {
    console.log(`\n🗄️ Running remote D1 migrations for ${appTarget}...`)
    const migrateCmd = pkg.scripts['db:migrate'].replaceAll('--local', '--remote')
    const migrateArgs = parseMigrateCommand(migrateCmd)
    run('doppler', ['run', '--', ...migrateArgs], appDir)
  }

  // 4. Deploy
  console.log(`\n☁️ Deploying ${appTarget} to Edge...`)
  try {
    run('doppler', ['run', '--', 'pnpm', 'run', 'deploy'], appDir)
  } catch (error) {
    console.error(`\n❌ Deploy failed for ${appTarget}.`)
    process.exit(1)
  }

  // 5. Fleet Registry Sync
  console.log(`\n📡 Syncing with Control Plane Fleet Registry...`)
  try {
    const { appName, controlPlaneUrl, fleetApiKey, siteUrl } = resolveFleetSyncContext(
      appTarget,
      appDir,
    )

    if (!siteUrl) {
      console.log(
        `⏭ SITE_URL not set and no production route could be inferred — skipping fleet sync.`,
      )
    } else if (!fleetApiKey) {
      console.log(`⏭ CONTROL_PLANE_API_KEY or AGENT_ADMIN_API_KEY not set — skipping fleet sync.`)
    } else {
      const fleetSyncUrl = buildFleetSyncUrl(controlPlaneUrl, appName)
      if (!fleetSyncUrl) {
        console.log(
          `⏭ Could not build fleet sync URL from CONTROL_PLANE_URL=${controlPlaneUrl || '(empty)'} — skipping fleet sync.`,
        )
      } else {
        const response = await fetch(fleetSyncUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${fleetApiKey}`,
            'Content-Type': 'application/json',
            'x-requested-with': 'XMLHttpRequest',
          },
          body: JSON.stringify({ url: siteUrl, isActive: true }),
          signal: AbortSignal.timeout(15_000),
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`)
        }

        console.log(`✅ Fleet registry synced for ${appName}.`)
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.log(`⚠️ Fleet sync failed (non-fatal): ${message}`)
  }

  console.log(`\n🎉 Successfully shipped ${appTarget}!`)
}

async function main() {
  const args = process.argv.slice(2)
  const targetArg = args[0] || 'web' // default to web target

  let targets = [targetArg]

  if (targetArg === 'showcase') {
    // Expand showcase macro
    targets = [
      'showcase',
      'example-auth',
      'example-blog',
      'example-marketing',
      'example-og-image',
      'example-apple-maps',
    ]
  } else if (targetArg.includes(',')) {
    targets = targetArg.split(',').map((t) => t.trim())
  }

  for (const target of targets) {
    console.log(`\n======================================================`)
    console.log(`🚀 INITIATING SHIP SEQUENCE FOR: ${target}`)
    console.log(`======================================================\n`)
    await shipApp(target)
  }
}

main()
