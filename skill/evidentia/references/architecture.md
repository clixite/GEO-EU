# Architecture (reference for discovery, developer and migration modes)

Evidentia is a TypeScript monorepo (Node ≥ 24, pnpm). Everything runs locally or
self-hosted; the only outbound calls are to model providers you registered and
to pages you asked it to fetch, always through the SSRF-hardened `safeFetch`.

```
packages/core     domain engine (no framework)
  storage/        SQLite via node:sqlite (FTS5), append-only migrations
  audit/          hash-chained ledger — every consequential action
  governance/     schemas, policy engine (YAML), registers, approvals, provenance, retention
  providers/      model-agnostic adapters (Anthropic, OpenAI-compatible, Google, local, demo), policy-aware router, cost meter
  knowledge/      HTML/Markdown extraction, chunking, claims, entities, store (+ quarantine)
  retrieval/      BM25 + vectors, reciprocal rank fusion, authority/freshness signals, citations
  geo/            robots evaluation per AI agent, readiness-v1 analyser
  content/        grounded prompts, deterministic claim verification, Markdown rendering
  observatory/    query sets, repeated sampling, Wilson intervals, reports
  publishing/     pipeline (draft→verified→gated→approved→published), adapters
  evals/          deterministic dataset runner
  security/       prompt-injection scanner
packages/cli      `evidentia` command (used by this skill)
apps/admin        governance console (server-rendered, CSP, RBAC, CSRF)
website           public site (Astro, static)
governance/       policies/*.yaml, sources.yaml (EU legal source register)
evals/datasets    golden/regression sets
demo/             fictional Northwind Bank dataset (offline end-to-end)
docs/             ARCHITECTURE, GEO_METHODOLOGY, EU_GOVERNANCE, THREAT_MODEL, …
```

## Data flow

```
sources ─ingest→ documents ─chunk→ chunks(FTS+vector) ─extract→ claims, entities
                     │ quarantine if prompt-injection ↴
query ─hybrid search→ evidence[E1..En] ─grounded prompt→ model (policy-routed)
      → draft ─verify (deterministic)→ gate (policy) → approval (four-eyes, hash-bound)
      → publish (disclosure + signed manifest) → receipt
query set ─sample×n via official APIs→ observations ─Wilson→ visibility report
every step ─→ audit ledger (hash chain)  ·  every model call ─→ cost meter
```

## Key invariants

- Model access is deny-by-default per data class; fallback stays inside the
  policy-allowed set.
- Approvals bind to the body hash; editing after approval voids it.
- Prompt text never reaches logs or the ledger (hash only).
- Quarantined documents are invisible to retrieval until released by a reviewer.
- Published pages carry a visible notice and a signed provenance manifest.

## Storage and portability

SQLite file per deployment (WAL, `secure_delete`). `evidentia export --out` gives
a complete JSON export per tenant (Data Act / portability); `erase tenant`
removes everything except the ledger. A PostgreSQL adapter is a documented
future item (ADR-0002).

## Migration from GEOFlow (or similar)

Evidentia is a clean-room reimplementation; nothing is imported automatically.
Map: GEOFlow knowledge base → `source add` + `ingest`; titles/keywords →
query sets; quality gate → `draft verify` + `draft gate`; manual release →
`draft approve`; WordPress/HTTP channels → `draft publish --target`; Doubao/
DeepSeek visibility probes → registered EU-allowed models + `observe run`.
See docs/UPSTREAM_ANALYSIS.md §16–18 for the feature matrix and licensing.
