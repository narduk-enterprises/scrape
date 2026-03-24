# Skills Guide

Agent skills are modular instruction sets that extend AI coding agents with
domain-specific expertise. Skills live in `SKILL.md` files with optional
supporting directories and work across Cursor, Codex, Antigravity, and GitHub
Copilot.

## Architecture

```
~/.skills/                        ← Global skills library (canonical)
├── clean-code-skill/SKILL.md
├── nuxt-patterns/SKILL.md
├── ...
└── skills-lock.json              ← Tracks externally-installed skills

Per-repo agent symlinks (all → ~/.skills):
  .agent/skills   → ~/.skills     (Antigravity)
  .cursor/skills  → ~/.skills     (Cursor)
  .codex/skills   → ~/.skills     (Codex)
  .github/skills  → ~/.skills     (GitHub Copilot)
```

The symlink bridge (`tools/ensure-skills-links.ts`) makes every skill available
to every agent without duplication. Run `pnpm run skills:link` to set up
symlinks after cloning a repo.

## Skill Anatomy

Every skill has a directory containing a `SKILL.md` file:

```
my-skill/
├── SKILL.md              ← Required: frontmatter + instructions
├── scripts/              ← Optional: helper scripts
├── examples/             ← Optional: reference implementations
├── references/           ← Optional: supporting docs
└── resources/            ← Optional: templates, assets
```

### SKILL.md Frontmatter

```yaml
---
name: my-skill # Kebab-case identifier
description: 'One-line summary' # Shown in agent skill lists
risk: safe # safe | unknown | elevated
source: custom # custom | community | github-user/repo
date_added: '2026-03-23' # ISO date
---
```

### SKILL.md Body

After the frontmatter, write markdown instructions following this structure:

1. **Title and overview** — what the skill does
2. **When to use** — activation triggers
3. **When NOT to use** — scope boundaries
4. **Instructions** — step-by-step guidance, best practices, checklists
5. **Examples** — concrete usage scenarios

Keep instructions actionable and specific. Agents read these as literal
instructions, not documentation for humans.

## Installing Skills

### Method 1: `npx skills add` (open standard)

Install skills from any GitHub repository that follows the agent skills
standard:

```bash
# Install a specific skill from a GitHub repo
npx skills add https://github.com/antfu/skills --skill nuxt

# Non-interactive batch install
npx skills add https://github.com/vuejs-ai/skills \
  --skill vue-best-practices --skill vue-pinia-best-practices \
  --yes --scope global --method symlink

# Check for updates
npx skills check

# Update installed skills
npx skills update
```

> [!WARNING] The `npx skills` CLI installs to `.agents/skills/` as its canonical
> location and creates **reverse** symlinks in `~/.skills/` that point back to
> the project. This is the opposite of our architecture. After installing, you
> must move the skill to `~/.skills/` and remove the reverse symlink:
>
> ```bash
> rm -f ~/.skills/<skill-name>
> mv .agents/skills/<skill-name> ~/.skills/<skill-name>
> pnpm run skills:link
> ```
>
> Alternatively, clone the repo and copy directly (see Method 3).

Installed skills are tracked in `skills-lock.json`:

```json
{
  "version": 1,
  "skills": {
    "nuxt": {
      "source": "antfu/skills",
      "sourceType": "github",
      "computedHash": "9e8237ec..."
    }
  }
}
```

### Method 2: `/skill-create` workflow

Use the `/skill-create` agent workflow to scaffold a new skill interactively:

```
/skill-create
```

The workflow guides through naming, scoping, scaffolding, and registration.

### Method 3: Manual creation

Create the skill directory in `~/.skills/` directly:

```bash
mkdir -p ~/.skills/my-skill
cat > ~/.skills/my-skill/SKILL.md << 'EOF'
---
name: my-skill
description: "What this skill does"
risk: safe
source: custom
date_added: "2026-03-23"
---

# My Skill

Instructions here...
EOF
```

## Cross-Agent Compatibility

All four supported agents discover skills through their respective directory
symlinks:

| Agent       | Skill Directory  | Symlink Target |
| ----------- | ---------------- | -------------- |
| Antigravity | `.agent/skills`  | `~/.skills`    |
| Cursor      | `.cursor/skills` | `~/.skills`    |
| Codex       | `.codex/skills`  | `~/.skills`    |
| GitHub      | `.github/skills` | `~/.skills`    |

The symlinks are:

- **Created** by `pnpm run skills:link` (runs `tools/ensure-skills-links.ts`)
- **Maintained** by `sync-template` and `update-layer` (they call
  `ensureSkillsLinks()` automatically)
- **Gitignored** — each repo's `.gitignore` excludes all four paths

> [!IMPORTANT] The `.agents/skills/` directory (note the plural) is a separate,
> repo-local skill path used by some agents for skills that ship with the
> template itself (e.g., the Nuxt UI MCP skill). These are NOT symlinked to
> `~/.skills` and are synced via normal recursive directory sync.

## Fleet Distribution

Skills reach downstream apps through two channels:

### Channel 1: Global library (user-scoped)

`~/.skills` is a user-level directory. Skills installed here are available to
every repo on the machine. `pnpm run skills:link` creates the per-agent symlinks
in each repo.

### Channel 2: Template sync (repo-scoped)

Skills in `.agent/skills/` (which itself symlinks to `~/.skills`) are not
directly synced. However:

- `ensure-skills-links.ts` runs during every `sync-template` and `update-layer`
  invocation
- This means fleet apps always get the symlink bridge set up automatically
- Any skill added to `~/.skills` on the developer's machine is immediately
  available to all local fleet repos

### Channel 3: Repo-local skills

Skills in `.agents/skills/` (plural, not symlinked) are synced as regular files
via `RECURSIVE_SYNC_DIRECTORIES` in `sync-manifest.ts`. Use this for skills that
must ship with the template (e.g., MCP-based skills with references
subdirectories).

## Skills Inventory

### Global Library (`~/.skills`)

| Skill                         | Source            | Description                                                   |
| ----------------------------- | ----------------- | ------------------------------------------------------------- |
| `brand-guidelines`            | anthropics/skills | Anthropic brand colors and typography for visual artifacts    |
| `clean-code-skill`            | ClawForge         | Clean Code principles (Uncle Bob)                             |
| `deep-context-builder-skill`  | custom            | Ultra-granular line-by-line code analysis                     |
| `exception-triage`            | custom            | Decide fix vs tracked exception for guardrail issues          |
| `fleet-guardrails`            | custom            | Audit and repair fleet app guardrails                         |
| `frontend-design`             | anthropics/skills | Production-grade frontend interfaces with high design quality |
| `logo-icon-generator`         | custom            | App logo and full icon set from concept to production         |
| `mutation-hardening`          | custom            | Harden server mutations with auth and validation              |
| `nuxt-patterns`               | ECC               | Nuxt 4 SSR, hydration, data fetching patterns                 |
| `seo-structure-architect`     | custom            | Content structure and schema markup optimization              |
| `shared-package-release`      | custom            | Release and roll out shared guardrail packages                |
| `sitemap-analysis-generation` | custom            | XML sitemap analysis and generation                           |
| `ui-ux-designer`              | community         | UI/UX design systems, accessibility, research                 |
| `vue-best-practices`          | vuejs-ai/skills   | Vue 3 Composition API, SSR, Volar, and vue-tsc patterns       |
| `vue-pinia-best-practices`    | vuejs-ai/skills   | Pinia stores, state management, and reactivity patterns       |
| `vue-testing-best-practices`  | vuejs-ai/skills   | Vitest, Vue Test Utils, component testing, and Playwright     |

### Repo-Local (`.agents/skills/`)

| Skill     | Source       | Description                                  |
| --------- | ------------ | -------------------------------------------- |
| `nuxt-ui` | antfu/skills | Nuxt UI 4 component library with MCP support |

## Useful Commands

```bash
# Set up symlinks in current repo
pnpm run skills:link

# Install skill from GitHub
npx skills add https://github.com/<owner>/<repo> --skill <name>

# Check for updates to installed skills
npx skills check

# Update all installed skills
npx skills update

# Sync skills to fleet (happens automatically during template sync)
pnpm run sync:fleet -- --auto-commit
```
