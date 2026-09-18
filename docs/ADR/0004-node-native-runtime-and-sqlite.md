# ADR-0004 — Native Node.js runtime features and SQLite as the default store

**Status:** accepted · **Date:** 2026-09-18

## Context
Supply-chain minimisation and self-hosting simplicity were hard requirements.
Node.js 24 ships native TypeScript execution (type stripping), `node:sqlite`
with FTS5 and JSON functions, Ed25519 in `node:crypto`, and `node:test`.

## Decision
- Run TypeScript directly (no build step for core/CLI/console); enforce
  `erasableSyntaxOnly` so stripped code is exactly what type-checks.
- Use `node:sqlite` as the default store (WAL, `secure_delete`, FTS5 for BM25,
  vectors as BLOBs with brute-force cosine).
- Use `node:test` for unit/integration tests; Playwright for browser tests.

## Consequences
- Node ≥ 24 is required (documented); the experimental-warning for SQLite is
  suppressed in scripts.
- Vector search is linear in the number of chunks — acceptable to ~10^5 chunks
  per tenant; PostgreSQL/pgvector adapter is the scale path (ADR-0002).
- Two runtime dependencies in the core (`zod`, `yaml`).
