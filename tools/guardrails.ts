import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export type GuardrailSeverity = 'warn' | 'fail'

export interface GuardrailFinding {
  ruleId: string
  severity: GuardrailSeverity
  message: string
  detail?: string[]
}

export interface GuardrailException {
  file: string
  line: number
  kind: 'eslint-disable' | 'ts-ignore' | 'ts-expect-error' | 'ts-nocheck'
  rule?: string | null
  reason: string
  owner: string
  createdAt: string
  expiresAt: string
}

export interface GuardrailReport {
  root: string
  checkedAt: string
  ok: boolean
  findings: GuardrailFinding[]
  summary: {
    fail: number
    warn: number
  }
}

interface SuppressionSite {
  file: string
  line: number
  kind: GuardrailException['kind']
  rule: string | null
}

const REQUIRED_GITIGNORE_ENTRIES = ['.env', '.env.*', '.dev.vars', 'doppler.yaml', 'doppler.json']
const COMMENT_FILE_PATTERN = /\.(ts|mts|cts|tsx|js|mjs|cjs|jsx|vue)$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const IGNORED_DIRS = new Set([
  '.git',
  '.nuxt',
  '.output',
  '.nitro',
  '.wrangler',
  '.data',
  '.turbo',
  'dist',
  'node_modules',
  '__pycache__',
])
const FORBIDDEN_REPO_FILE_PATTERNS = [
  { label: 'environment file', pattern: /(^|\/)\.env(?:\.[^/]+)?$/ },
  { label: 'Workers env file', pattern: /(^|\/)\.dev\.vars$/ },
  { label: 'Doppler local config', pattern: /(^|\/)doppler\.yaml$/ },
  { label: 'Doppler export', pattern: /(^|\/)doppler\.json$/ },
] as const
const JUNK_REPO_FILE_PATTERNS = [
  {
    label: 'local sqlite database',
    pattern: /(^|\/)(?:local|dev|test|tmp|wrangler)\.sqlite(?:3)?$/i,
  },
  { label: 'sqlite sidecar file', pattern: /(^|\/).+\.sqlite(?:-wal|-shm)$/i },
  { label: 'Playwright report output', pattern: /(^|\/)playwright-report(\/|$)/ },
  { label: 'test result output', pattern: /(^|\/)test-results(\/|$)/ },
  { label: 'typecheck error log', pattern: /(^|\/)typecheck_errors\.log$/ },
  { label: 'Wrangler state directory', pattern: /(^|\/)\.wrangler\/state(\/|$)/ },
] as const
const SUPPRESSION_COMMENT_PATTERN = /(?:\/\/|\/\*|<!--)\s*eslint-disable(?:-(?:next-line|line))?\b/
const TS_DIRECTIVE_COMMENT_PATTERN = /(?:\/\/|\/\*)\s*@ts-(?:ignore|expect-error|nocheck)\b/
const MAX_TS_NOCHECK_EXCEPTION_WINDOW_DAYS = 30

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/')
}

function formatSite(site: SuppressionSite): string {
  const suffix = site.rule ? ` (${site.rule})` : ''
  return `${site.file}:${site.line} ${site.kind}${suffix}`
}

function getSiteKey(site: Pick<SuppressionSite, 'file' | 'line' | 'kind' | 'rule'>): string {
  return `${site.file}:${site.line}:${site.kind}:${site.rule ?? ''}`
}

function compareIsoDates(left: string, right: string): number {
  return left.localeCompare(right)
}

function isoDateToUtcDay(value: string): number | null {
  if (!DATE_PATTERN.test(value)) return null

  const [year, month, day] = value.split('-').map((segment) => Number(segment))
  if (!year || !month || !day) return null

  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

function getIsoDaySpan(start: string, end: string): number | null {
  const startDay = isoDateToUtcDay(start)
  const endDay = isoDateToUtcDay(end)
  if (startDay === null || endDay === null) return null
  return endDay - startDay
}

function isGitRepo(root: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return true
  } catch {
    return false
  }
}

function listRepoFiles(root: string): string[] {
  if (isGitRepo(root)) {
    try {
      const output = execFileSync(
        'git',
        ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
        {
          cwd: root,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
        },
      )
      return output
        .split('\0')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map(normalizePath)
        .filter((file) => existsSync(join(root, file)))
        .sort()
    } catch {
      // Fall through to filesystem walk.
    }
  }

  const files: string[] = []
  const visit = (currentDir: string) => {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.name === '.DS_Store') continue

      const fullPath = join(currentDir, entry.name)
      const relativePath = normalizePath(fullPath.slice(root.length + 1))

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue
        visit(fullPath)
        continue
      }

      files.push(relativePath)
    }
  }

  visit(root)
  return files.sort()
}

function loadGuardrailExceptions(root: string): {
  entries: GuardrailException[]
  findings: GuardrailFinding[]
} {
  const manifestPath = join(root, 'guardrail-exceptions.json')
  if (!existsSync(manifestPath)) {
    return {
      entries: [],
      findings: [
        {
          ruleId: 'guardrail-exceptions-manifest',
          severity: 'fail',
          message: 'guardrail-exceptions.json is missing.',
          detail: ['Add the manifest, even if it only contains an empty array.'],
        },
      ],
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  } catch (error: any) {
    return {
      entries: [],
      findings: [
        {
          ruleId: 'guardrail-exceptions-manifest',
          severity: 'fail',
          message: 'guardrail-exceptions.json is not valid JSON.',
          detail: [String(error?.message || error)],
        },
      ],
    }
  }

  if (!Array.isArray(parsed)) {
    return {
      entries: [],
      findings: [
        {
          ruleId: 'guardrail-exceptions-manifest',
          severity: 'fail',
          message: 'guardrail-exceptions.json must be an array.',
        },
      ],
    }
  }

  const entries: GuardrailException[] = []
  const invalidDetails: string[] = []
  const today = new Date().toISOString().slice(0, 10)

  for (const [index, rawEntry] of parsed.entries()) {
    const prefix = `entry ${index}`
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
      invalidDetails.push(`${prefix}: must be an object`)
      continue
    }

    const entry = rawEntry as Record<string, unknown>
    const file = typeof entry.file === 'string' ? normalizePath(entry.file.trim()) : ''
    const line = typeof entry.line === 'number' ? entry.line : Number.NaN
    const kind = entry.kind
    const rule =
      typeof entry.rule === 'string'
        ? entry.rule.trim()
        : entry.rule === null || entry.rule === undefined
          ? null
          : ''
    const reason = typeof entry.reason === 'string' ? entry.reason.trim() : ''
    const owner = typeof entry.owner === 'string' ? entry.owner.trim() : ''
    const createdAt = typeof entry.createdAt === 'string' ? entry.createdAt.trim() : ''
    const expiresAt = typeof entry.expiresAt === 'string' ? entry.expiresAt.trim() : ''

    if (!file) invalidDetails.push(`${prefix}: file is required`)
    if (!Number.isInteger(line) || line < 1) invalidDetails.push(`${prefix}: line must be >= 1`)
    if (
      kind !== 'eslint-disable' &&
      kind !== 'ts-ignore' &&
      kind !== 'ts-expect-error' &&
      kind !== 'ts-nocheck'
    ) {
      invalidDetails.push(
        `${prefix}: kind must be eslint-disable, ts-ignore, ts-expect-error, or ts-nocheck`,
      )
    }
    if (kind === 'eslint-disable' && rule !== null && !String(rule).trim()) {
      invalidDetails.push(`${prefix}: eslint-disable entries need a rule or "*"`)
    }
    if (!reason) invalidDetails.push(`${prefix}: reason is required`)
    if (!owner) invalidDetails.push(`${prefix}: owner is required`)
    if (!DATE_PATTERN.test(createdAt))
      invalidDetails.push(`${prefix}: createdAt must be YYYY-MM-DD`)
    if (!DATE_PATTERN.test(expiresAt))
      invalidDetails.push(`${prefix}: expiresAt must be YYYY-MM-DD`)
    if (DATE_PATTERN.test(expiresAt) && compareIsoDates(expiresAt, today) < 0) {
      invalidDetails.push(`${prefix}: expired on ${expiresAt}`)
    }
    if (
      kind === 'ts-nocheck' &&
      DATE_PATTERN.test(createdAt) &&
      DATE_PATTERN.test(expiresAt) &&
      (getIsoDaySpan(createdAt, expiresAt) ?? 0) > MAX_TS_NOCHECK_EXCEPTION_WINDOW_DAYS
    ) {
      invalidDetails.push(
        `${prefix}: ts-nocheck expiresAt must be within ${MAX_TS_NOCHECK_EXCEPTION_WINDOW_DAYS} days of createdAt`,
      )
    }

    entries.push({
      file,
      line: Number.isInteger(line) ? line : 0,
      kind: kind as GuardrailException['kind'],
      rule,
      reason,
      owner,
      createdAt,
      expiresAt,
    })
  }

  return {
    entries,
    findings:
      invalidDetails.length === 0
        ? []
        : [
            {
              ruleId: 'guardrail-exceptions-manifest',
              severity: 'fail',
              message: `${invalidDetails.length} invalid guardrail exception entr${invalidDetails.length === 1 ? 'y' : 'ies'}.`,
              detail: invalidDetails.map((detail) => `  ${detail}`),
            },
          ],
  }
}

function scanSuppressionSites(
  root: string,
  repoFiles: string[],
): {
  sites: SuppressionSite[]
  findings: GuardrailFinding[]
} {
  const sites: SuppressionSite[] = []
  const missingReasonDetails: string[] = []

  for (const file of repoFiles) {
    if (!COMMENT_FILE_PATTERN.test(file)) continue

    const absolutePath = join(root, file)
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) continue

    const content = readFileSync(absolutePath, 'utf-8')
    const lines = content.split('\n')

    for (const [index, line] of lines.entries()) {
      const lineNumber = index + 1
      const hasSuppressionComment = SUPPRESSION_COMMENT_PATTERN.test(line)
      const hasTsDirectiveComment = TS_DIRECTIVE_COMMENT_PATTERN.test(line)

      if (
        /(?:\/\/|\/\*|<!--)\s*eslint-disable-(?:next-line|line)\b/.test(line) &&
        !/--\s*\S/.test(line)
      ) {
        missingReasonDetails.push(
          `${file}:${lineNumber} eslint-disable-next-line is missing an inline reason`,
        )
      }

      if (
        hasSuppressionComment &&
        !line.includes('eslint-disable-next-line') &&
        !line.includes('eslint-disable-line')
      ) {
        if (!/--\s*\S/.test(line)) {
          missingReasonDetails.push(
            `${file}:${lineNumber} eslint-disable is missing an inline reason`,
          )
        }

        const match = line.match(/(?:\/\/|\/\*|<!--)\s*eslint-disable\b(.*?)(?:--|\*\/|-->|$)/)
        const rawRule = match?.[1]?.trim() || '*'
        const normalizedRule = rawRule.replace(/^[,*\s]+|[,*\s]+$/g, '').trim() || '*'
        sites.push({
          file,
          line: lineNumber,
          kind: 'eslint-disable',
          rule: normalizedRule,
        })
      }

      if (hasTsDirectiveComment && !/[:\-–—]\s*\S/.test(line)) {
        missingReasonDetails.push(
          `${file}:${lineNumber} TypeScript suppression is missing an inline reason`,
        )
      }

      if (hasTsDirectiveComment && line.includes('@ts-nocheck')) {
        sites.push({ file, line: lineNumber, kind: 'ts-nocheck', rule: null })
      }

      if (hasTsDirectiveComment && line.includes('@ts-ignore')) {
        sites.push({ file, line: lineNumber, kind: 'ts-ignore', rule: null })
      }

      if (hasTsDirectiveComment && line.includes('@ts-expect-error')) {
        sites.push({ file, line: lineNumber, kind: 'ts-expect-error', rule: null })
      }
    }
  }

  return {
    sites,
    findings:
      missingReasonDetails.length === 0
        ? []
        : [
            {
              ruleId: 'suppression-inline-reason',
              severity: 'fail',
              message: `${missingReasonDetails.length} suppression comment(s) are missing an inline reason.`,
              detail: missingReasonDetails.map((detail) => `  ${detail}`),
            },
          ],
  }
}

function checkGitignore(root: string): GuardrailFinding[] {
  const gitignorePath = join(root, '.gitignore')
  if (!existsSync(gitignorePath)) {
    return [
      {
        ruleId: 'gitignore-secrets',
        severity: 'fail',
        message: '.gitignore is missing.',
      },
    ]
  }

  const content = readFileSync(gitignorePath, 'utf-8')
  const missing = REQUIRED_GITIGNORE_ENTRIES.filter((entry) => !content.includes(entry))
  if (missing.length === 0) return []

  return [
    {
      ruleId: 'gitignore-secrets',
      severity: 'fail',
      message: `${missing.length} required secret-ignore pattern(s) are missing from .gitignore.`,
      detail: missing.map((entry) => `  ${entry}`),
    },
  ]
}

function checkForbiddenRepoFiles(repoFiles: string[]): GuardrailFinding[] {
  const matches = repoFiles
    .filter((file) => {
      const basename = file.split('/').pop() || file
      const isExampleConfig =
        /^\.env\.(?:example|sample|template)$/i.test(basename) ||
        /^doppler\.(?:example|sample|template)\.ya?ml$/i.test(basename) ||
        /^doppler\.(?:example|sample|template)\.json$/i.test(basename)

      if (isExampleConfig) return false
      return FORBIDDEN_REPO_FILE_PATTERNS.some(({ pattern }) => pattern.test(file))
    })
    .sort()
  if (matches.length === 0) return []

  return [
    {
      ruleId: 'forbidden-secret-files',
      severity: 'fail',
      message: `${matches.length} tracked or unignored local secret/config file(s) found.`,
      detail: matches.map((file) => `  ${file}`),
    },
  ]
}

function checkJunkRepoFiles(repoFiles: string[]): GuardrailFinding[] {
  const details = repoFiles
    .map((file) => {
      const match = JUNK_REPO_FILE_PATTERNS.find(({ pattern }) => pattern.test(file))
      if (!match) return null
      return `  ${file} (${match.label})`
    })
    .filter((detail): detail is string => Boolean(detail))
    .sort()

  if (details.length === 0) return []

  return [
    {
      ruleId: 'forbidden-junk-files',
      severity: 'fail',
      message: `${details.length} tracked or unignored local artifact file(s) found.`,
      detail: details,
    },
  ]
}

function checkHooksPath(root: string): GuardrailFinding[] {
  if (!isGitRepo(root)) {
    return [
      {
        ruleId: 'git-hooks-path',
        severity: 'warn',
        message: 'Not a git worktree; skipping hooksPath check.',
      },
    ]
  }

  let hooksPath = ''
  try {
    hooksPath = execFileSync('git', ['config', '--get', 'core.hooksPath'], {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    hooksPath = ''
  }

  const normalized = hooksPath.replace(/\/+$/, '').replace(/^\.\//, '')
  if (normalized === '.githooks') return []

  return [
    {
      ruleId: 'git-hooks-path',
      severity: 'fail',
      message: 'git core.hooksPath is not set to .githooks.',
      detail: ['  Run: git config core.hooksPath .githooks'],
    },
  ]
}

function checkSuppressionExceptions(root: string, repoFiles: string[]): GuardrailFinding[] {
  const findings: GuardrailFinding[] = []
  const manifest = loadGuardrailExceptions(root)
  findings.push(...manifest.findings)

  const suppressionScan = scanSuppressionSites(root, repoFiles)
  findings.push(...suppressionScan.findings)

  if (manifest.findings.length > 0) {
    return findings
  }

  const siteMap = new Map(suppressionScan.sites.map((site) => [getSiteKey(site), site]))
  const requiresTrackedException = (site: Pick<SuppressionSite, 'file' | 'kind'>) => {
    if (site.kind === 'ts-ignore' || site.kind === 'ts-nocheck') return true
    if (site.kind !== 'eslint-disable') return false

    return (
      site.file.startsWith('tools/') ||
      site.file.startsWith('packages/') ||
      site.file.includes('/server/')
    )
  }
  const missingDetails: string[] = []
  const staleDetails: string[] = []

  for (const site of suppressionScan.sites) {
    if (!requiresTrackedException(site)) continue

    const hasEntry = manifest.entries.some(
      (entry) =>
        entry.file === site.file &&
        entry.line === site.line &&
        entry.kind === site.kind &&
        (entry.rule ?? null) === site.rule,
    )
    if (!hasEntry) {
      missingDetails.push(`  Missing exception entry for ${formatSite(site)}`)
    }
  }

  for (const entry of manifest.entries) {
    if (!requiresTrackedException(entry)) continue

    const key = getSiteKey({
      file: entry.file,
      line: entry.line,
      kind: entry.kind,
      rule: entry.rule ?? null,
    })
    if (!siteMap.has(key)) {
      staleDetails.push(`  Stale exception entry for ${entry.file}:${entry.line} ${entry.kind}`)
    }
  }

  if (missingDetails.length > 0) {
    findings.push({
      ruleId: 'guardrail-exceptions',
      severity: 'fail',
      message: `${missingDetails.length} suppression site(s) are missing guardrail exception entries.`,
      detail: missingDetails,
    })
  }

  if (staleDetails.length > 0) {
    findings.push({
      ruleId: 'guardrail-exceptions',
      severity: 'fail',
      message: `${staleDetails.length} stale guardrail exception entr${staleDetails.length === 1 ? 'y' : 'ies'} found.`,
      detail: staleDetails,
    })
  }

  return findings
}

function checkTsNoCheckDebt(root: string, repoFiles: string[]): GuardrailFinding[] {
  const suppressionScan = scanSuppressionSites(root, repoFiles)
  const tsNoCheckSites = suppressionScan.sites
    .filter((site) => site.kind === 'ts-nocheck')
    .sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line)

  if (tsNoCheckSites.length === 0) return []

  return [
    {
      ruleId: 'ts-nocheck-debt',
      severity: 'warn',
      message: `${tsNoCheckSites.length} @ts-nocheck site(s) remain in the repo.`,
      detail: tsNoCheckSites.map((site) => `  ${formatSite(site)}`),
    },
  ]
}

export function auditRepoGuardrails(rootDir: string): GuardrailReport {
  const root = resolve(rootDir)
  const repoFiles = listRepoFiles(root)
  const findings = [
    ...checkGitignore(root),
    ...checkForbiddenRepoFiles(repoFiles),
    ...checkJunkRepoFiles(repoFiles),
    ...checkHooksPath(root),
    ...checkSuppressionExceptions(root, repoFiles),
    ...checkTsNoCheckDebt(root, repoFiles),
  ]

  const summary = findings.reduce(
    (acc, finding) => {
      acc[finding.severity] += 1
      return acc
    },
    { fail: 0, warn: 0 },
  )

  return {
    root,
    checkedAt: new Date().toISOString(),
    ok: summary.fail === 0,
    findings,
    summary,
  }
}

export function formatGuardrailReport(report: GuardrailReport): string {
  const lines = [
    `Guardrail audit — ${report.root}`,
    `Status: ${report.ok ? 'PASS' : 'FAIL'} (${report.summary.fail} fail, ${report.summary.warn} warn)`,
  ]

  if (report.findings.length === 0) {
    lines.push('No guardrail findings.')
    return lines.join('\n')
  }

  for (const finding of report.findings) {
    lines.push(``)
    lines.push(`[${finding.severity.toUpperCase()}] ${finding.ruleId} — ${finding.message}`)
    for (const detail of finding.detail || []) {
      lines.push(detail)
    }
  }

  return lines.join('\n')
}

export function writeGuardrailArtifact(
  report: GuardrailReport,
  outputDir = join(report.root, 'artifacts', 'guardrails'),
): { latestPath: string; timestampPath: string } {
  mkdirSync(outputDir, { recursive: true })
  const timestamp = report.checkedAt.replaceAll(':', '-')
  const timestampPath = join(outputDir, `${timestamp}.json`)
  const latestPath = join(outputDir, 'latest.json')
  const payload = JSON.stringify(report, null, 2) + '\n'

  writeFileSync(timestampPath, payload, 'utf-8')
  writeFileSync(latestPath, payload, 'utf-8')

  return { latestPath, timestampPath }
}
