---
description:
  Scaffold a new agent skill with proper structure, frontmatter, and cross-agent
  registration
---

# Create a New Skill

This workflow scaffolds a new agent skill, registers it, and ensures it is
available to all supported AI agents (Cursor, Codex, Antigravity, GitHub
Copilot).

> [!IMPORTANT] Read `docs/agents/skills.md` for full skills architecture before
> proceeding.

> [!CAUTION] **Skills MUST be installed to `~/.skills/` (global)**, not into
> per- project directories. The `ensure-skills-links.ts` symlink bridge makes
> them available to every repo. The `npx skills` CLI defaults to project scope
> and creates reverse symlinks — you MUST use a post-install fixup (see Step 2b)
> or install manually (Step 2c) to get the correct layout.

---

## 0. Scope the Skill

Ask the user for the following inputs (fill in sensible defaults if the user
provides partial info):

1. **Skill name** (kebab-case, e.g. `vue-testing`)
2. **One-line description** (shown in agent skill lists)
3. **Source type**: `custom` | `community` | `<github-user/repo>`
4. **Risk level**: `safe` | `unknown` | `elevated`
5. **Optional subdirectories**: `scripts/`, `examples/`, `references/`,
   `resources/`

### Placement Rules

- **Global `~/.skills/`** (default, strongly preferred) — every repo on this
  machine sees the skill via `skills:link`. Use for all external and custom
  skills.
- **Repo-local `.agents/skills/`** — only for skills that MUST ship with the
  template (e.g., the Nuxt UI MCP skill with a `references/` tree). These sync
  to fleet but do NOT use the symlink bridge.

---

## 1. Check for Duplicates

// turbo

```bash
ls ~/.skills/ 2>/dev/null && echo "---" && ls .agents/skills/ 2>/dev/null
```

Check if a skill with similar name or purpose already exists. If so, ask the
user whether to extend the existing one or create a new one.

---

## 2. Install the Skill

### 2a. Via `npx skills add` (from a GitHub repo)

```bash
npx -y skills add https://github.com/<owner>/<repo> --skill <name> --yes --scope global --method symlink
```

### 2b. Post-install fixup (REQUIRED after `npx skills add`)

The `npx skills` CLI installs to `.agents/skills/` as its canonical location and
creates reverse symlinks in `~/.skills/` that point BACK to the project. This is
the **opposite** of our architecture. Fix it:

```bash
# For each skill just installed:
rm -f ~/.skills/<skill-name>
mv .agents/skills/<skill-name> ~/.skills/<skill-name>
# Also clean any extra agent copies the CLI created:
rm -rf .claude/skills/<skill-name> skills/<skill-name>
```

Then run `pnpm run skills:link` to restore the correct symlink bridge.

### 2c. Manual install (no fixup needed)

Clone the source repo and copy the skill directly to `~/.skills/`:

```bash
cd /tmp
git clone --depth 1 https://github.com/<owner>/<repo>.git _skill-src
cp -r _skill-src/skills/<skill-name> ~/.skills/<skill-name>
rm -rf _skill-src
```

### 2d. Scaffold a custom skill from scratch

```bash
mkdir -p ~/.skills/<skill-name>
```

Create `~/.skills/<skill-name>/SKILL.md`:

```markdown
---
name: <skill-name>
description: '<one-line description>'
risk: <safe|unknown|elevated>
source: <custom|community|github-user/repo>
date_added: '<YYYY-MM-DD>'
---

# <Skill Title>

<Brief overview of what this skill does and when to use it.>

## When to Use

- <Trigger condition 1>
- <Trigger condition 2>

## When NOT to Use

- <Out-of-scope condition 1>

## Instructions

<Step-by-step guidance, best practices, checklists.>

## Examples

<Concrete usage scenarios.>
```

Optionally create supporting directories:

```bash
mkdir -p ~/.skills/<skill-name>/scripts
mkdir -p ~/.skills/<skill-name>/examples
mkdir -p ~/.skills/<skill-name>/references
mkdir -p ~/.skills/<skill-name>/resources
```

---

## 3. Write the Skill Content

Populate the SKILL.md with actionable, agent-readable instructions:

- Keep instructions **specific and actionable** — agents execute these literally
- Use **numbered steps** for procedural tasks
- Include **code examples** with correct syntax
- Add **checklists** for verification
- Reference supporting files with relative paths if present

> [!TIP] Good skill content reads like a recipe: clear inputs, concrete steps,
> and verifiable outputs. Avoid vague guidance like "follow best practices."

---

## 4. Register External Sources (optional)

If the skill came from a GitHub repository, update `~/.skills/skills-lock.json`:

```json
{
  "version": 1,
  "skills": {
    "<skill-name>": {
      "source": "<github-user/repo>",
      "sourceType": "github",
      "computedHash": "<sha256-of-SKILL.md-content>"
    }
  }
}
```

---

## 5. Verify Cross-Agent Discovery

// turbo

```bash
pnpm run skills:link
```

Confirm the skill is accessible from all agent skill directories:

// turbo

```bash
ls -la .agent/skills/<skill-name>/SKILL.md 2>/dev/null && echo "✅ Antigravity" || echo "❌ Antigravity"
ls -la .cursor/skills/<skill-name>/SKILL.md 2>/dev/null && echo "✅ Cursor" || echo "❌ Cursor"
ls -la .codex/skills/<skill-name>/SKILL.md 2>/dev/null && echo "✅ Codex" || echo "❌ Codex"
ls -la .github/skills/<skill-name>/SKILL.md 2>/dev/null && echo "✅ GitHub Copilot" || echo "❌ GitHub Copilot"
```

All four should pass because `.agent/skills` → `~/.skills` (symlink bridge).

---

## 6. Update Documentation

Update the skills inventory table in `docs/agents/skills.md`:

- Add the new skill to the **Global Library** table
- Include the skill name, source, and description

---

## Summary Checklist

- [ ] Skill installed to `~/.skills/` (NOT `.agents/skills/`)
- [ ] No reverse symlinks in `~/.skills/` pointing to project dirs
- [ ] SKILL.md has valid YAML frontmatter (name, description, risk, source,
      date_added)
- [ ] Instructions are actionable and agent-readable
- [ ] No duplicate skill exists
- [ ] `pnpm run skills:link` passes — all 4 agent dirs see the skill
- [ ] `docs/agents/skills.md` inventory updated
