# Architecture

Evidentia is a TypeScript monorepo (pnpm workspaces) targeting Node.js ≥ 24. The
core engine is framework-free; surfaces (CLI, console, website, skill) are thin.

## Components

```
┌────────────┐  ┌────────────────┐  ┌──────────────┐  ┌───────────────┐
│ CLI        │  │ Console (Hono) │  │ Agent Skill  │  │ Website       │
│ packages/  │  │ apps/admin     │  │ skill/       │  │ (Astro static)│
│ cli        │  │ SSR, RBAC, CSP │  │ → CLI        │  │               │
└─────┬──────┘  └───────┬────────┘  └──────┬───────┘  └───────────────┘
      └─────────────────┴──────────────────┘
                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│ packages/core                                                        │
│ knowledge · retrieval · geo · content · governance · providers       │
│ observatory · publishing · evals · security · audit · observability  │
│ storage: node:sqlite (FTS5, WAL, secure_delete), append-only migrations│
└──────────────────────────────────────────────────────────────────────┘
                        ▼ safeFetch only
   model providers · publishing targets · pages to analyse/ingest
```

## Core modules (packages/core/src)

| Module | Responsibility | Key types |
|---|---|---|
| `storage` | `openDatabase`, migrations v1–v6, transactions | `Database` |
| `audit` | hash-chained ledger, `verify()` | `AuditLedger`, `AuditEvent` |
| `observability` | structured logger with redaction, correlation ids | `Logger` |
| `governance/schemas` | data classes, hosting, model/AI-system/processing records | zod schemas |
| `governance/policy` | YAML policy parsing, model-access and publication decisions | `PolicyDocument`, `Decision` |
| `governance/registers` | model registry, AI system register, processing register | classes |
| `governance/approvals` | four-eyes, hash-bound, single-consumption approvals | `ApprovalService` |
| `governance/provenance` | Ed25519 manifests, marking artefacts | `SignedManifest` |
| `governance/retention` | retention, tenant export, tenant erasure | functions |
| `net/safeFetch` | SSRF-hardened outbound HTTP | `safeFetch` |
| `providers/*` | adapter interface, Anthropic/OpenAI-compatible/Google/local/demo/fake, factory, policy-aware router, cost meter | `ProviderAdapter`, `PolicyAwareRouter`, `CostMeter` |
| `knowledge/*` | HTML/Markdown extraction, chunker, claims, entities, store (quarantine, DSAR) | `KnowledgeStore` |
| `retrieval/hybrid` | BM25 + vector, RRF, signals, citations, decomposition | `HybridRetriever`, `RetrievalHit` |
| `geo/robots`, `geo/analyzer` | per-agent robots evaluation, `readiness-v1` | `ReadinessReport` |
| `content/*` | grounded prompt, deterministic verification, Markdown renderer | `verifyDraft` |
| `publishing/*` | pipeline states and adapters | `ContentPipeline`, `PublishAdapter` |
| `observatory/*` | Wilson statistics, query sets, runs, reports | `Observatory` |
| `security/injection` | prompt-injection scanner | `scanForInjection` |
| `evals/runner` | deterministic dataset runner | `runDataset` |

## Data model (SQLite)

`schema_migrations`, `audit_events`, `sources`, `documents`, `chunks` (+ `chunks_fts`),
`claims`, `entities`, `entity_mentions`, `ai_systems`, `model_registry`,
`approvals`, `processing_records`, `drafts`, `publications`, `query_sets`,
`observations`, `model_calls`. Every business table carries `tenant_id`; JSON
columns hold canonical JSON.

## Request flows

1. **Ingest**: `KnowledgeStore.ingest` → fingerprint → extract → chunk →
   injection scan (quarantine) → embed via router (policy) → FTS + claims +
   entities → ledger `document.ingest`.
2. **Draft**: retrieve evidence → `buildGroundedPrompt` → `router.complete`
   (policy, cost) → `ContentPipeline.createDraft` → `verify` → `gate`
   (`evaluatePublication`) → approval request → `decide` (four-eyes) →
   `publish` (consume approval, render, sign, adapter, receipt).
3. **Analyse**: `analyzePage(html, robots, headers)` → checks with tiers →
   dimensions → score; ledger `readiness.analyze`.
4. **Observe**: `Observatory.run` → router per sample → detect mention/citation →
   observations → `report` (Wilson, per model/intent, series breaks).

## Invariants

- Deny-by-default model access; fallback inside the allowed set only.
- Prompt/answer text never in logs or ledger.
- Quarantined documents invisible to retrieval and drafting.
- Approvals bind to `sha256(body)`; edits reset the draft.
- Published drafts immutable; ledger append-only and verifiable.

## Extension points

- `ProviderAdapter` — add a vendor; `buildAdapters` — default endpoints.
- `PublishAdapter` — add a target.
- `Migration` — schema evolution (append only).
- Policy YAML — organisation-specific rules without code changes.
- Eval datasets — regression and golden sets.

## Non-goals in 1.0

PostgreSQL/pgvector backend, PDF/DOCX ingestion, OIDC/MFA in the console,
multi-node deployments, browser-extension publishing, image generation.

See ADRs in `docs/ADR/`.
