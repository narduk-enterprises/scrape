#!/usr/bin/env -S pnpm exec tsx
/**
 * Ensures each agent-facing `skills` entry in the repo points at the vendored
 * `.agents/skills` directory:
 * - `.agents/skills` → canonical, physical repo content
 * - `.cursor/skills`, `.codex/skills`, `.github/skills`, `.agent/skills`,
 *   `.claude/skills` → relative symlinks to `../.agents/skills`
 *
 * Invoked by `pnpm run skills:link`, at the start of `sync-template` /
 * `update-layer`, and from `sync-fleet` when auto-commit skips a dirty app.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const selfPath = fileURLToPath(import.meta.url)
const entryPath = process.argv[1] ? resolve(process.argv[1]) : ''
const isMainModule = Boolean(entryPath && entryPath === selfPath)

const AGENT_SKILL_ROOTS = ['.cursor', '.codex', '.agent', '.github', '.claude']
const RELATIVE_SKILLS_TARGET = '../.agents/skills'
const TRANSIENT_SKILLS_DIRECTORIES = new Set(['.git', '__pycache__', '.pytest_cache', 'node_modules'])
const TRANSIENT_SKILLS_FILES = new Set(['.DS_Store'])

export interface EnsureSkillsLinksOptions {
  dryRun?: boolean
  log?: (message: string) => void
}

function ensureParentDir(dir: string, dryRun: boolean, log: (message: string) => void) {
  if (existsSync(dir)) return
  log(`  ADD: mkdir ${dir}`)
  if (!dryRun) {
    mkdirSync(dir, { recursive: true })
  }
}

/** True if anything exists at path (including a broken symlink). */
function pathOccupied(linkPath: string): boolean {
  try {
    lstatSync(linkPath)
    return true
  } catch {
    return false
  }
}

function pruneSkillsArtifacts(
  rootDir: string,
  dryRun: boolean,
  log: (message: string) => void,
): void {
  if (!existsSync(rootDir) || !lstatSync(rootDir).isDirectory()) return

  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)

      if (entry.isDirectory()) {
        if (TRANSIENT_SKILLS_DIRECTORIES.has(entry.name)) {
          log(`  REMOVE transient skills dir: ${fullPath}`)
          if (!dryRun) rmSync(fullPath, { recursive: true, force: true })
          continue
        }

        visit(fullPath)
        continue
      }

      if (TRANSIENT_SKILLS_FILES.has(entry.name) || entry.name.endsWith('.pyc')) {
        log(`  REMOVE transient skills file: ${fullPath}`)
        if (!dryRun) rmSync(fullPath, { force: true })
      }
    }
  }

  visit(rootDir)
}

export function ensureSkillsLinks(appDir: string, options: EnsureSkillsLinksOptions = {}): void {
  const dryRun = options.dryRun ?? false
  const log = options.log ?? console.log
  const localAgentsDir = join(appDir, '.agents')
  const localSkillsDir = join(localAgentsDir, 'skills')
  ensureParentDir(localAgentsDir, dryRun, log)

  if (!existsSync(localSkillsDir)) {
    log('  SKIP: skills links (.agents/skills is missing in this repo)')
    return
  }

  const localSkillsStat = lstatSync(localSkillsDir)
  if (!localSkillsStat.isDirectory() || localSkillsStat.isSymbolicLink()) {
    log('  SKIP: skills links (.agents/skills must be a physical repo directory)')
    return
  }

  pruneSkillsArtifacts(localSkillsDir, dryRun, log)

  for (const root of AGENT_SKILL_ROOTS) {
    const rootDir = join(appDir, root)
    const linkPath = join(rootDir, 'skills')

    ensureParentDir(rootDir, dryRun, log)

    let needsReplace = false
    if (pathOccupied(linkPath)) {
      needsReplace = true
      try {
        const st = lstatSync(linkPath)
        if (st.isSymbolicLink()) {
          const target = readlinkSync(linkPath)
          if (target === RELATIVE_SKILLS_TARGET) {
            needsReplace = false
          }
        }
      } catch {}
    } else {
      needsReplace = true
    }

    if (needsReplace) {
      if (pathOccupied(linkPath)) {
        log(`  REMOVE old symlink/dir: ${linkPath}`)
        if (!dryRun) rmSync(linkPath, { recursive: true, force: true })
      }

      log(`  ADD symlink: ${root}/skills -> ${RELATIVE_SKILLS_TARGET}`)
      if (!dryRun) {
        const originalDir = process.cwd()
        process.chdir(rootDir)
        try {
          symlinkSync(RELATIVE_SKILLS_TARGET, 'skills')
        } finally {
          process.chdir(originalDir)
        }
      }
    }
  }

  const legacyRootSkills = join(appDir, '.skills')
  if (pathOccupied(legacyRootSkills)) {
    log('  REMOVE: legacy repo-root .skills')
    if (!dryRun) rmSync(legacyRootSkills, { recursive: true, force: true })
  }
}

if (isMainModule) {
  const root = resolve(__dirname, '..')
  const dryRun = process.argv.includes('--dry-run')
  console.log('')
  console.log(`Skills links: ${root}${dryRun ? ' [DRY RUN]' : ''}`)
  ensureSkillsLinks(root, { dryRun, log: console.log })
  console.log('')
}
