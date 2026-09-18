# Contributing

Evidentia is developed by Clixite SRL. Customers and partners with repository
access are welcome to propose changes.

## Ground rules

- English only, everywhere: code, comments, docs, commit messages, UI.
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `perf:`, `ci:`, `chore:`.
- One logical change per commit; feature branches; pull requests against `main`.
- Never commit secrets, `.env` files, keys or large binaries. `gitleaks` runs in CI.
- No code, prompts, templates or text may be copied from GEOFlow or other
  AGPL/GPL projects (ADR-0003). Dependencies must pass the licence allow-list.

## Before opening a pull request

```bash
pnpm typecheck
pnpm test
node --test "skill/evidentia/evals/*.test.mjs"
node scripts/smoke.ts
node packages/cli/bin/evidentia.mjs evals run --db :memory:
pnpm build && pnpm test:e2e
node scripts/licenses.ts
```

Add or update tests with every change; add an eval case when fixing a
behavioural bug in analysis, verification, policy, robots or injection handling.
Update the relevant document in `docs/` when behaviour changes, and write an ADR
(`docs/ADR/NNNN-title.md`) for significant architectural decisions.

## Code style

TypeScript strict with `erasableSyntaxOnly` (no enums, parameter properties or
namespaces), explicit types on exported APIs, `.ts` relative imports, no `any`
in application code, small files (< 800 lines), functions that fit on a screen.
Errors are `EvidentiaError` with stable codes; logs go through the redacting
logger; never `console.log` in product code.

## Security

Report vulnerabilities privately (SECURITY.md). Security-relevant changes
(auth, policy, SSRF, injection, ledger, provenance) require a second reviewer.
