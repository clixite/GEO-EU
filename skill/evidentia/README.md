# Evidentia Agent Skill

The `evidentia` skill lets Claude Code (and other Agent-Skills-compatible tools)
operate the Evidentia platform: GEO readiness analysis, trusted knowledge,
evidence-grounded drafting, governance gates, AI-visibility measurement and
EU governance evidence — through the audited `evidentia` CLI.

Built and maintained by Clixite SRL — Belgium.

## Requirements

- Node.js 24 or newer (native TypeScript execution, `node:sqlite`).
- The Evidentia repository checked out with `pnpm install` run, **or** the
  `EVIDENTIA_CLI` environment variable pointing to `packages/cli/bin/evidentia.mjs`.
- An initialised store: `evidentia init` (creates `.evidentia/evidentia.db`).

## Install

From the repository root:

```bash
# Claude Code, user scope (~/.claude/skills/evidentia)
node skill/evidentia/scripts/install.mjs --scope user

# Claude Code, project scope (./.claude/skills/evidentia)
node skill/evidentia/scripts/install.mjs --scope project

# Also publish the open-standard location (./.agents/skills/evidentia) for other tools
node skill/evidentia/scripts/install.mjs --scope project --agents
```

The installer validates the package (frontmatter, file manifest in
`evals/expected-artifacts.json`), backs up any existing installation to
`<target>.backup-<timestamp>`, copies the files, and re-verifies the copy.
Restart Claude Code afterwards; the skill appears as `/evidentia`.

## Verify

```bash
node skill/evidentia/scripts/verify-install.mjs --scope user
node ~/.claude/skills/evidentia/scripts/check-environment.mjs
```

## Upgrade

Run the installer again from the newer repository checkout; the previous copy is
kept as a timestamped backup.

## Roll back / remove

```bash
node skill/evidentia/scripts/uninstall.mjs --scope user       # moves the install to a backup folder
# or restore a backup manually:
mv ~/.claude/skills/evidentia.backup-<timestamp> ~/.claude/skills/evidentia
```

## Layout

```
skill/evidentia/
├── SKILL.md            control plane: modes, workflow, guardrails
├── README.md
├── references/         loaded on demand per mode
├── scripts/            deterministic helpers (plain Node.js)
├── evals/              trigger cases, file manifest, script tests
└── assets/             JSON templates (model record, AI system, query set)
```

## Test the package

```bash
node --test "skill/evidentia/evals/*.test.mjs"
```
