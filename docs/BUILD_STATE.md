# Build state — Evidentia (GEO-EU)

Durable working state for long-horizon work. Updated continuously. This file is a
log of decisions, phases and evidence; it is not a substitute for the real docs.

## Identity
- Product: **Evidentia** — governed generative visibility for European organisations.
- Owner: Clixite SRL (Belgium). Repo: github.com/clixite/GEO-EU (private).
- Branch: `feat/evidentia-v1` (from `main`).
- Upstream studied: yaojingang/GEOFlow @ `9ed2fe80457d5eb280a4bca7cf799895bf2ca3b1`
  (source 3.2.0-beta.1, latest stable v3.1.0, AGPL-3.0-only + NOTICE).

## Capability matrix (environment, verified 2026-09-18)
| Capability | Status |
|---|---|
| Node.js 24.12 (native TS type-stripping, `node:sqlite` 3.50 with FTS5, `node:test`) | available, verified by probe |
| pnpm 10.26, npm 11.6 | available |
| Python 3.14 / 3.13 | available (not used at runtime) |
| Docker 29.1 | available |
| gh 2.83, git 2.52, GitHub MCP | available, authenticated as `clixite` |
| Playwright 1.63 | available via npx |
| gitleaks 8.30 | available |
| semgrep, trivy, syft, osv-scanner, lighthouse | NOT installed locally (npm-based / GitHub Actions equivalents used) |
| PHP / composer | NOT installed (upstream analysed statically, never executed) |
| Hostinger, Vercel MCP connectors | available (deployment options) |
| Skills used | superpowers (process), ai-seo, security-review, tdd-workflow, frontend-design |

## Phases
| # | Phase | Status | Evidence |
|---|---|---|---|
| 0 | Repo created, skeleton, branch | done | commits on main + feat branch |
| 1 | Environment discovery | done | table above; sqlite+fts5 probe passed |
| 2 | Upstream forensic analysis | in progress (background agent) | -> docs/UPSTREAM_ANALYSIS.md |
| 3 | GEO/AEO state of the art | in progress (background agent) | -> docs/GEO_METHODOLOGY.md |
| 4 | EU governance primary sources | in progress (background agent) | -> docs/EU_GOVERNANCE.md, governance/sources.yaml |
| 5 | Agent Skills conventions | in progress (background agent) | -> skill/ |
| 6 | Product identity + ADRs | done | docs/ADR/0001..0003 |
| 7 | Core engine (TypeScript) | in progress | packages/core |
| 8 | Governance control plane | pending | packages/core/src/governance |
| 9 | CLI | pending | packages/cli |
| 10 | Agent Skill | pending | skill/ |
| 11 | Admin app | pending | apps/admin |
| 12 | Website | pending | website/ |
| 13 | Security: threat model, scans, SBOM | pending | docs/THREAT_MODEL.md, .github/workflows |
| 14 | Tests: unit/integration/e2e | pending | tests/ |
| 15 | Adversarial review + fixes | pending | docs/reviews/ |
| 16 | Release, FINAL_REPORT.md | pending | |

## Decisions (see docs/ADR/)
- ADR-0001 product identity: Evidentia.
- ADR-0002 stack: TypeScript monorepo, Node >= 24, SQLite (node:sqlite) default store, zero-framework core, Hono admin, Astro website.
- ADR-0003 clean-room implementation: no upstream code copied; upstream studied for ideas only.

## Blockers
- none

## Verification log
- 2026-09-18: `node --test probe/a.ts` (node:sqlite + FTS5 + json_extract + TS stripping) — pass.
- 2026-09-18: `pnpm install` root devDependencies (typescript 7.0.2, @types/node 24.12.0, @playwright/test 1.63.0) — ok, lockfile v9.
