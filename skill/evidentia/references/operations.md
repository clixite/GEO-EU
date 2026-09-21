# Operations (reference for operations mode)

## Install (product)

```bash
git clone https://github.com/clixite/GEO-EU.git && cd GEO-EU
pnpm install --frozen-lockfile
node packages/cli/bin/evidentia.mjs init            # creates .evidentia/evidentia.db + signing key
export EVIDENTIA_CLI=$PWD/packages/cli/bin/evidentia.mjs   # optional, for the skill scripts
```
Requirements: Node ≥ 24, pnpm ≥ 10. No PHP, no Docker, no external database.
Full guide: docs/INSTALLATION.md. Docker image: docs/OPERATIONS.md.

## Configuration (environment only)

| Variable | Purpose |
|---|---|
| `EVIDENTIA_DB` | SQLite path (default `.evidentia/evidentia.db`) |
| `EVIDENTIA_TENANT`, `EVIDENTIA_ACTOR` | tenant id, actor recorded in the ledger |
| `EVIDENTIA_POLICY` | policy YAML (default `governance/policies/eu-default.yaml`) |
| `EVIDENTIA_SIGNING_KEY` | Ed25519 key file for manifests |
| `EVIDENTIA_PROVIDER_<NAME>_API_KEY` | provider secrets (e.g. `…_MISTRAL_…`, `…_ANTHROPIC_…`) |
| `EVIDENTIA_PUBLISH_WORDPRESS`, `EVIDENTIA_PUBLISH_HTTP_SECRET` | publishing credentials |
| `EVIDENTIA_ADMIN_SECRET`, `EVIDENTIA_ADMIN_USERS`, `PORT`, `HOST` | governance console |

Never put secrets in files that are committed; `.env.example` lists the names.

## Registering models

1. Copy `assets/model-record.template.json`, fill hosting/retention/training/
   DPA facts from the signed contract.
2. `evidentia model register --file model.json` (status `draft`).
3. Evaluate, then `evidentia model status <id> approved --note "DPA ref …"` (admin).
4. `scripts/policy-precheck.mjs` to confirm which data classes it may process.

## Daily / weekly

- `evidentia status` (knowledge, quarantine, approvals, cost, ledger).
- `evidentia observe run <set> --models … --samples 8` weekly; `observe report`.
- `evidentia retention apply` (scheduled); `evidentia audit verify` (scheduled,
  alert on non-zero exit).
- `evidentia cost --since <iso>`; budgets are configured in code via
  `CostMeter` (hard budgets block, soft budgets alert).

## Backup / restore

Stop writers, copy the SQLite file (and `-wal`/`-shm` if present) and the
signing key; restore by copying back. Verify with `evidentia audit verify`.
`evidentia export --out` provides a portable JSON export per tenant.

## Upgrade / rollback

`git fetch && git checkout <tag> && pnpm install --frozen-lockfile`; migrations
are append-only and applied automatically on open. Roll back by checking out
the previous tag and restoring the pre-upgrade database backup (schema
migrations are not reversed automatically). Release process: docs/RELEASE.md.

## Console

`EVIDENTIA_ADMIN_SECRET=… EVIDENTIA_ADMIN_USERS='[{"name":"…","role":"approver","tokenHash":"<sha256>"}]' pnpm --filter @evidentia/admin start`
Bind to localhost and put a TLS, identity-aware reverse proxy (MFA/SSO) in front.

## CI

`.github/workflows/ci.yml`: typecheck, tests, evals, smoke, build, Playwright,
`pnpm audit`, licence allow-list, SBOM, gitleaks, CodeQL, Semgrep.
