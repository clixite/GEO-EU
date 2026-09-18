# Installation

All commands below are exercised by CI (`scripts/smoke.ts`, skill script tests,
Playwright) or documented as examples where marked.

## Requirements

- Node.js **24.0 or newer** (native TypeScript execution and `node:sqlite`).
- pnpm **10** (`corepack enable && corepack prepare pnpm@10.26.2 --activate`).
- Windows, macOS or Linux. No PHP, Docker, Redis or database server.

## Platform

```bash
git clone https://github.com/clixite/GEO-EU.git
cd GEO-EU
pnpm install --frozen-lockfile
node packages/cli/bin/evidentia.mjs init            # .evidentia/evidentia.db + signing key
node packages/cli/bin/evidentia.mjs status
```

Optional alias / global link:

```bash
alias evidentia="node $PWD/packages/cli/bin/evidentia.mjs"      # shell alias
pnpm --filter @evidentia/cli link --global                       # example: global `evidentia`
```

## Offline demo

```bash
evidentia init --db ./.evidentia/demo.db --tenant demo
evidentia demo load --db ./.evidentia/demo.db --tenant demo
node scripts/smoke.ts                                             # full 18-step flow, temp store
```

## Register a model provider

1. `cp skill/evidentia/assets/model-record.template.json model.json` and fill
   the data-policy facts from the signed contract.
2. Export the key: `export EVIDENTIA_PROVIDER_MISTRAL_API_KEY=…` (name pattern
   `EVIDENTIA_PROVIDER_<PROVIDER>_API_KEY`, provider in upper case, non-alphanumerics → `_`).
3. `evidentia model register --file model.json`
4. `evidentia model status <id> approved --note "DPA reference …"`
5. `evidentia policy check --provider mistral --model mistral-large-latest --classes internal`

## Governance console

```bash
export EVIDENTIA_ADMIN_SECRET="$(openssl rand -hex 32)"
TOKEN="$(openssl rand -hex 24)"; HASH="$(node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" "$TOKEN")"
export EVIDENTIA_ADMIN_USERS="[{\"name\":\"you@example.org\",\"role\":\"admin\",\"tokenHash\":\"$HASH\"}]"
pnpm --filter @evidentia/admin start                              # http://127.0.0.1:8787
```
Sign in with `$TOKEN`. Bind to localhost; terminate TLS and enforce SSO/MFA at a
reverse proxy (docs/OPERATIONS.md).

## Agent Skill (Claude Code)

```bash
node skill/evidentia/scripts/install.mjs --scope user             # ~/.claude/skills/evidentia
node skill/evidentia/scripts/install.mjs --scope project --agents # ./.claude/skills + ./.agents/skills
node skill/evidentia/scripts/verify-install.mjs --scope user
node ~/.claude/skills/evidentia/scripts/check-environment.mjs
```
Restart Claude Code; use `/evidentia` or let it trigger automatically.
Upgrade: rerun `install.mjs` (backup kept). Remove: `uninstall.mjs --scope user`.
Rollback: rename the `.backup-<timestamp>` directory back.

Set `EVIDENTIA_CLI=/path/to/GEO-EU/packages/cli/bin/evidentia.mjs` when the
skill runs outside the repository checkout.

## Website

```bash
pnpm --filter @evidentia/website build                            # website/dist (static)
```
Deploy `website/dist` to any static host (Hostinger, Vercel, S3/CloudFront…).

## Verify everything

```bash
pnpm typecheck && pnpm test
node --test "skill/evidentia/evals/*.test.mjs"
node packages/cli/bin/evidentia.mjs evals run --db :memory:
pnpm build && pnpm exec playwright install chromium && pnpm test:e2e
node scripts/licenses.ts && node scripts/sbom.ts
```

## Uninstall

Delete the repository checkout and the `.evidentia/` directory (store, key,
published files). Remove the skill with `uninstall.mjs`. Revoke provider keys.
