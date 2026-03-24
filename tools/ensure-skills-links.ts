#!/usr/bin/env -S pnpm exec tsx
/**
 * Wires each agent’s `skills` directory to the global library at ~/.skills:
 * - `.cursor/skills`, `.codex/skills`, `.agent/skills`, `.github/skills` → ~/.skills
 * - No repo-root `.skills` entry (removed if present as symlink/file).
 *
 * Symlinks are gitignored; run `pnpm run skills:link` (or template sync) after clone.
 *
 * Invoked by `pnpm run skills:link`, at the start of `sync-template` / `update-layer`
 * (before the app dirty check), and from `sync-fleet` when auto-commit skips a dirty app.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  rmdirSync,
  symlinkSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const selfPath = fileURLToPath(import.meta.url)
const entryPath = process.argv[1] ? resolve(process.argv[1]) : ''
const isMainModule = Boolean(entryPath && entryPath === selfPath)

const AGENT_SKILL_ROOTS = ['.cursor', '.codex', '.agent', '.github'] as const

export interface EnsureSkillsLinksOptions {
  dryRun?: boolean
  log?: (message: string) => void
}

function ensureParentDir(filePath: string, dryRun: boolean, log: (message: string) => void) {
  const dir = dirname(filePath)
  if (existsSync(dir)) return
  log(`  ADD: mkdir ${dir}`)
  if (!dryRun) {
    mkdirSync(dir, { recursive: true })
  }
}

/** True if anything exists at path (including a broken symlink — existsSync can lie). */
function pathOccupied(linkPath: string): boolean {
  try {
    lstatSync(linkPath)
    return true
  } catch {
    return false
  }
}

function ensureSymlink(
  targetAbsolute: string,
  linkPath: string,
  label: string,
  dryRun: boolean,
  log: (message: string) => void,
): boolean {
  const want = resolve(targetAbsolute)
  ensureParentDir(linkPath, dryRun, log)

  if (pathOccupied(linkPath)) {
    try {
      const st = lstatSync(linkPath)
      if (st.isSymbolicLink()) {
        const raw = readlinkSync(linkPath, 'utf8')
        const cur = resolve(dirname(linkPath), raw)
        let curCanon = cur
        let wantCanon = want
        try {
          curCanon = realpathSync(cur)
        } catch {
          // broken or unreadable target
        }
        try {
          wantCanon = realpathSync(want)
        } catch {
          // fall back to resolved string
        }
        if (curCanon === wantCanon) {
          return false
        }
      }
    } catch {
      // fall through to replace
    }
    log(`  REPLACE symlink: ${label}`)
  } else {
    log(`  ADD symlink: ${label}`)
  }

  if (!dryRun) {
    try {
      rmSync(linkPath, { recursive: true, force: true })
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err ? (err as NodeJS.ErrnoException).code : ''
      if (code !== 'ENOENT') {
        throw err
      }
    }
    symlinkSync(want, linkPath)
  }
  return true
}

function canonicalGlobalSkillsPath(globalSkillsDir: string): string {
  try {
    return realpathSync(globalSkillsDir)
  } catch {
    return resolve(globalSkillsDir)
  }
}

/** Drop legacy repo-root `.skills` (symlink or file). Leave non-empty directories untouched. */
function removeRepoRootDotSkills(
  appDir: string,
  dryRun: boolean,
  log: (message: string) => void,
): void {
  const p = join(appDir, '.skills')
  if (!existsSync(p)) return
  let st: ReturnType<typeof lstatSync>
  try {
    st = lstatSync(p)
  } catch {
    return
  }

  if (st.isSymbolicLink() || st.isFile()) {
    log(`  REMOVE: ${p} (use per-agent skills/ symlinks only)`)
    if (!dryRun) {
      rmSync(p, { recursive: true, force: true })
    }
    return
  }

  if (st.isDirectory()) {
    const entries = readdirSync(p)
    if (entries.length === 0) {
      log(`  REMOVE: empty directory ${p}`)
      if (!dryRun) {
        rmdirSync(p)
      }
    } else {
      log(
        `  WARN: ${p} is a non-empty directory — not removed; move contents to ~/.skills if needed`,
      )
    }
  }
}

/**
 * Remove `~/.skills/home` if present (leftover from older `…/skills/home` layouts or mistaken paths).
 */
function removeStrayHomeInGlobalLibrary(
  globalSkillsDir: string,
  dryRun: boolean,
  log: (message: string) => void,
): void {
  const stray = join(globalSkillsDir, 'home')
  if (!existsSync(stray)) return
  let st: ReturnType<typeof lstatSync>
  try {
    st = lstatSync(stray)
  } catch {
    return
  }

  if (st.isSymbolicLink()) {
    log(`  REMOVE stray: ${stray} (obsolete layout; agents use <tool>/skills → ~/.skills)`)
    if (!dryRun) {
      rmSync(stray, { recursive: true, force: true })
    }
    return
  }

  if (st.isDirectory()) {
    const entries = readdirSync(stray)
    if (entries.length === 0) {
      log(`  REMOVE stray: ${stray} (empty directory)`)
      if (!dryRun) {
        rmdirSync(stray)
      }
      return
    }
    log(
      `  WARN: ${stray} is a non-empty directory — not removed; rename or delete manually if unintended`,
    )
  }
}

export function ensureSkillsLinks(appDir: string, options: EnsureSkillsLinksOptions = {}): void {
  const dryRun = options.dryRun ?? false
  const log = options.log ?? console.log
  const home = process.env.HOME || ''

  if (!home) {
    log('  SKIP: skills links (HOME is not set)')
    return
  }

  const globalSkillsDir = join(home, '.skills')
  if (!existsSync(globalSkillsDir)) {
    log(`  ADD: mkdir ${globalSkillsDir}`)
    if (!dryRun) {
      mkdirSync(globalSkillsDir, { recursive: true })
    }
  }

  removeStrayHomeInGlobalLibrary(globalSkillsDir, dryRun, log)

  const bridgeTarget = canonicalGlobalSkillsPath(globalSkillsDir)

  for (const root of AGENT_SKILL_ROOTS) {
    const linkPath = join(appDir, root, 'skills')
    const label = `${root}/skills -> ~/.skills`
    ensureSymlink(bridgeTarget, linkPath, label, dryRun, log)
  }

  // After agent paths point at ~/.skills, drop legacy repo-root `.skills` (including
  // targets of old `../.skills` indirection) so realpath checks stay valid on the next run.
  removeRepoRootDotSkills(appDir, dryRun, log)
}

if (isMainModule) {
  const root = resolve(__dirname, '..')
  const dryRun = process.argv.includes('--dry-run')
  console.log('')
  console.log(`Skills links: ${root}${dryRun ? ' [DRY RUN]' : ''}`)
  ensureSkillsLinks(root, { dryRun, log: console.log })
  console.log('')
}
