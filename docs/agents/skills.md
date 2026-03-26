# Skills Guide

Agent skills are vendored into this repository so every runtime sees the same
instructions from the checkout itself. The canonical tree is
`.agents/skills/`; every agent-facing `skills` path is just a relative symlink
back to that directory.

## Architecture

```text
.agents/skills/                  ← canonical, physical repo content
├── nuxt-ui/
├── frontend-design/
├── ...
└── <skill>/SKILL.md

.agent/skills   → ../.agents/skills   (Antigravity)
.cursor/skills  → ../.agents/skills   (Cursor)
.codex/skills   → ../.agents/skills   (Codex)
.claude/skills  → ../.agents/skills   (Claude-compatible tooling)
.github/skills  → ../.agents/skills   (GitHub Copilot / coding agents)
```

This matters because cloud agents only see repository contents. A local-only
`~/.skills` symlink cannot be resolved in remote execution environments.

## What `pnpm run skills:link` Does

`pnpm run skills:link` runs `tools/ensure-skills-links.ts`. It:

1. Verifies `.agents/skills` exists as a real directory in the repo.
2. Removes transient junk from that tree (`.git`, `.DS_Store`, `__pycache__`,
   `*.pyc`, etc.).
3. Repairs `.agent/skills`, `.cursor/skills`, `.codex/skills`, `.claude/skills`,
   and `.github/skills` so they all point to `../.agents/skills`.
4. Removes any legacy repo-root `.skills` directory.

It does not sync from `~/.skills`.

## Updating The Canonical Skill Tree

When you intentionally want to refresh the vendored skills from another source
(for example your local `~/.skills` clone), copy the content into
`.agents/skills` and keep the repo clean:

```bash
mkdir -p .agents/skills
rsync -a --delete --delete-excluded \
  --exclude='.git/' \
  --exclude='.DS_Store' \
  --exclude='__pycache__/' \
  --exclude='*.pyc' \
  "$HOME/.skills/" .agents/skills/
pnpm run skills:link
```

After that, review the diff and commit the vendored files and symlink entries
normally.

## Adding Or Editing A Skill

Create or edit skills directly under `.agents/skills/<skill-name>/`.

Each skill should include:

```text
my-skill/
├── SKILL.md
├── scripts/      # optional
├── examples/     # optional
├── references/   # optional
└── resources/    # optional
```

Minimal frontmatter:

```yaml
---
name: my-skill
description: Brief trigger-oriented summary
---
```

## Cross-Agent Compatibility

| Agent       | Entry Path        | Resolves To         |
| ----------- | ----------------- | ------------------- |
| Antigravity | `.agent/skills`   | `../.agents/skills` |
| Cursor      | `.cursor/skills`  | `../.agents/skills` |
| Codex       | `.codex/skills`   | `../.agents/skills` |
| Claude      | `.claude/skills`  | `../.agents/skills` |
| GitHub      | `.github/skills`  | `../.agents/skills` |

The symlink files themselves are committed so fresh clones and remote agents do
not need any local bootstrap to discover the skills.

## Template And Fleet Propagation

- `sync-template` and `update-layer` both call `ensureSkillsLinks()` after
  copying managed files.
- `.agents/skills` is synced as normal repo content through
  `RECURSIVE_SYNC_DIRECTORIES`.
- `.agent/skills`, `.cursor/skills`, `.codex/skills`, `.claude/skills`, and
  `.github/skills` are synced as verbatim symlink entries.
- Starter exports copy the same layout, so downstream repos inherit the full
  vendored skill tree.

## Useful Commands

```bash
# Repair agent-facing symlinks in the current repo
pnpm run skills:link

# Sync template-managed files from the authoring workspace into a downstream app
pnpm run sync-template ../my-app --allow-dirty-app

# Propagate the canonical template state across local fleet clones
pnpm run sync:fleet -- --auto-commit
```
