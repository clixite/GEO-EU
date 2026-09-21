# ADR-0002 — Technology stack

**Status:** accepted · **Date:** 2026-09-18

## Context
Requirements: enterprise-grade, security-first, minimal supply chain, portable Agent
Skill scripts (Windows/macOS/Linux — the upstream helpers were Bash/WSL-only),
self-hostable, testable without external services, model-agnostic.

Environment verified: Node 24.12 (native TypeScript type stripping, `node:sqlite`
3.50 with FTS5 and JSON functions, `node:test`), pnpm 10, Docker, Playwright 1.63.
PHP/Composer are not present, which rules out running or adapting the Laravel upstream.

## Options considered
1. Adapt the upstream Laravel/PHP code (AGPL) — rejected: PHP toolchain absent, AGPL
   network copyleft would bind the product, Chinese-first artefacts, heavy dependency graph.
2. Python + FastAPI — viable, but two runtimes (Python engine + Node website/tooling)
   double the supply-chain surface and complicate Skill portability.
3. **TypeScript monorepo on Node >= 24** — chosen.

## Decision
- Monorepo with pnpm workspaces: `packages/core` (domain engine), `packages/cli`
  (`evidentia` CLI used by the Skill), `apps/admin` (governance console), `website`
  (public site), `skill/` (Agent Skill package), `governance/` (policies, registers,
  source register), `evals/`, `tests/`.
- Runtime: Node >= 24.0 with native TS execution; no transpile step for core/cli.
  Type-checking via `tsc --noEmit` (TypeScript 7.x pinned).
- Persistence: SQLite through `node:sqlite` (FTS5 for lexical retrieval, JSON1, WAL).
  Storage is adapter-based so PostgreSQL/pgvector can be added later.
- Retrieval: hybrid — BM25 (FTS5) + embeddings (provider-abstracted, deterministic
  local fallback for tests) fused by reciprocal rank fusion, optional reranker.
- Validation: `zod`. Config and policies: YAML via `yaml`. Everything else standard library.
- Admin: Hono + `@hono/node-server`, server-rendered HTML, no client framework.
- Website: Astro, static output.
- Tests: `node:test` (unit/integration/policy/security), Playwright (browser/e2e).
- Supply chain: exact version pins, lockfile, `pnpm audit`, CycloneDX SBOM, gitleaks,
  CodeQL/Semgrep in CI, licence check.

## Consequences
- Very small runtime dependency set (target < 10 direct runtime deps across the
  product), reviewable by a CISO.
- Node 24 is a hard requirement for users of the Skill scripts (documented).
- No PostgreSQL in v1; documented limitation with an adapter seam.
