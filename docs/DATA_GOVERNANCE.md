# Data governance

## Data classes

`public` < `internal` < `confidential` < `personal` < `special-category`.
A request carries the most sensitive class of its inputs. Sources should be
classified at registration; drafting defaults to `internal`. Policies map
classes to allowed models (docs/MODEL_GOVERNANCE.md).

## Provenance

Source → document (fingerprint, fetch/publish/modify dates) → chunk (offsets,
heading path) → claim / entity. Retrieval hits and evidence items carry the
locator and offsets; manifests list evidence sources.

## Authority and validity

Sources carry `authorityLevel` (official/internal/third-party/unverified),
`licence`, `validFrom`/`validUntil`. Retrieval filters by validity (`asOf`) and
boosts authority.

## Freshness

`staleDocuments(tenant, days)`; readiness check P2 on published pages;
re-ingestion is content-addressed (no churn on unchanged pages).

## Quarantine

Injection findings quarantine documents; reviewers release with a note
(`document.release` in the ledger). Quarantined documents are excluded from
search unless `includeQuarantined` is set explicitly.

## Retention (policy `retentionDays`, defaults)

audit_event 3650 · model_call 365 · observation 730 · draft 1095 · document 1825 ·
approval 3650. `retention apply` purges model calls, observations and
rejected/blocked drafts; documents are managed by source lifecycle
(`source delete --reason`, audited); the ledger is archived, not pruned.

## Residency

SQLite lives where you run it. Provider residency is a registry attribute and a
policy constraint. Processing records hold `dataResidency` and transfer
mechanisms.

## Export and erasure

`evidentia export --out` (all tenant tables as JSON, documented schema =
migrations.ts). `evidentia erase tenant --reason --confirm` removes all tenant
rows except the ledger, and logs the erasure with counts.

## Ownership

Sources have `owner`; AI systems have `owner`; drafts have `author` and
`reviewer`; manifests name editorial responsibility. The console's overview
lists items needing an owner's attention (quarantine, approvals, overdue reviews).
