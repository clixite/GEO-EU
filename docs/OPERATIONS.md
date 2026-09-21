# Operations

## Runtime layout

```
.evidentia/
  evidentia.db (+ -wal, -shm)   SQLite store — back up as a unit
  signing-key.json               Ed25519 key (mode 0600) — back up separately, restrict access
  published/                     static-export target (console default)
```

## Configuration

Environment only (see `.env.example`). Secrets never enter the database, logs
or ledger. Use a secret manager or your process supervisor's env injection.

## Running

- **CLI trust boundary.** `--actor` (and `EVIDENTIA_ACTOR`) is a self-reported
  string recorded in the audit ledger and in four-eyes exclusion sets — the CLI
  has no login step and does not authenticate it. Run the CLI only under an
  already-trusted operator identity (a named service account, restricted to
  people who should be able to act as that actor), the same way you would trust
  `git commit --author`. Actions that need real accountability against a
  specific human — approving or rejecting a gated draft — should go through the
  console, which does authenticate the session before recording `decidedBy`.
- CLI: `node packages/cli/bin/evidentia.mjs …` (or alias `evidentia`).
- Console: `pnpm --filter @evidentia/admin start` → `http://127.0.0.1:8787`.
  Put a TLS reverse proxy with SSO/MFA in front (Caddy, nginx, Cloudflare Access,
  Pomerium…). Restrict egress to registered provider hosts and publish targets.
- Container (example):
  ```Dockerfile
  FROM node:24-alpine
  WORKDIR /app
  COPY . .
  RUN corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm build
  ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
  USER node
  CMD ["node", "--disable-warning=ExperimentalWarning", "apps/admin/src/server.ts"]
  ```
  Mount `.evidentia/` as a volume; run read-only elsewhere; drop capabilities.

## Scheduled jobs

| Job | Command | Cadence | Alert on |
|---|---|---|---|
| Ledger integrity | `evidentia audit verify` | daily | exit ≠ 0 |
| Retention | `evidentia retention apply` | daily | — |
| Visibility sampling | `evidentia observe run <set> --models … --samples 8` | weekly per engine/language | errors > 0 |
| Cost review | `evidentia cost --since <iso>` | weekly | budget alerts |
| Freshness | `evidentia status` (stale documents) | weekly | — |
| Head-hash anchoring | `evidentia audit verify --json` → store `headHash` in an external WORM/log | weekly | mismatch with previous export |

## Backup and restore

1. Quiesce writers (stop console/jobs).
2. Copy `evidentia.db`, `evidentia.db-wal`, `evidentia.db-shm` and
   `signing-key.json` to encrypted storage.
3. Restore by copying back; run `evidentia audit verify`.
Test restores quarterly. `evidentia export --out` provides a portable JSON export
per tenant (also the Data Act switching deliverable).

## Upgrade and rollback

- Upgrade: `git fetch && git checkout vX.Y.Z && pnpm install --frozen-lockfile`;
  migrations apply on first open (append-only). Read CHANGELOG for breaking notes.
- Rollback: check out the previous tag and restore the pre-upgrade backup.
- Skill: rerun `install.mjs`; backups are timestamped.

## Budgets

Configure `CostMeter` budgets in the runtime (per tenant/workload, window days,
EUR limit, hard/soft). Hard budgets make the router refuse calls (`policy_denied`,
audited); soft budgets alert via the `onBudgetExceeded` hook / logs.

## Monitoring

Structured JSON logs on stderr with request/job/correlation ids. Alert on:
`model.call_denied`, `auth.login_failed` bursts, `document.quarantine`, ledger
verification failures, publish failures (`draft.publish_failed`).

## Incident response (CRA-aligned)

1. Triage (severity, exploitation).
2. Contain: rotate affected secrets (`EVIDENTIA_ADMIN_SECRET` invalidates sessions;
   provider keys; signing key rotation with old public key kept published).
3. Preserve evidence: export ledger (`evidentia audit list --json`).
4. Report per SECURITY.md timelines (24 h early warning / 72 h notification / 14 d final for actively exploited vulnerabilities).
5. Post-mortem into docs/reviews/.

## Multi-tenancy guidance

One SQLite file per tenant for strong isolation (run separate processes or pass
`--db` per tenant). The shared-file mode keeps logical isolation only.

## Ledger archiving

Never delete ledger rows in place. To archive: export events ≤ cutoff, store the
export with its head hash externally, then (planned in 1.1) re-anchor. Until
then, keep the full ledger (default retention 10 years).
