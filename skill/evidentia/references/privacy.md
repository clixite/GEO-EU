# Privacy / GDPR (reference for privacy and knowledge modes)

Primary-source analysis: docs/EU_GOVERNANCE.md §B, §F, §I; register:
governance/sources.yaml. Engineering positions, not legal advice.

## Roles

Self-hosted: the customer is controller; Clixite is a software vendor. SaaS
operated by Clixite: Clixite is processor (Art. 28 DPA required). Model
providers are (sub-)processors — their hosting, retention, training use and
DPA status live in the model registry and are enforced by policy.

## Data minimisation by design

- Only the organisation's own sources are ingested (first-party content);
  third-party fetching honours robots.txt and is marked `third-party`/`unverified`.
- Prompts and answers are never logged; the ledger keeps hashes.
- Observatory stores answer hashes and outcomes, not answer text (unless
  `--store-raw` is deliberately used).
- Policy classes: `personal` requires zero-data-retention providers in EU/EEA
  or self-hosted; `special-category` is self-hosted only (eu-default).

## Records of processing (Art. 30)

`evidentia processing register --file record.json` — purpose, legal basis (+LIA
reference for legitimate interests), role, categories, subjects, processors,
transfers, retention, security measures, DPIA reference, residency.

## DPIA

Typically required for LLM processing of documents containing personal data
(WP248 criteria: new technology, data combination). Keep the reference on the
processing record and the AI system record. Template: docs/GDPR.md.

## Data subject rights

- Access: `evidentia dsar find "<term>"` lists chunks, claims, entity aliases.
- Rectification/erasure: `evidentia dsar redact "<term>" --replacement "…" --reason "DSAR-id"`
  rewrites every derived artefact; the ledger records a hash of the term only.
- Portability / Data Act switching: `evidentia export --out tenant.json`.
- Full erasure at contract end: `evidentia erase tenant --reason "…" --confirm`
  (ledger retained for accountability).

## Retention

Policy `retentionDays` (audit 10 y, model calls 1 y, observations 2 y, drafts
3 y, documents 5 y by default). `evidentia retention apply` purges model calls,
observations and rejected/blocked drafts past their windows. Ledger pruning is
an operator procedure (archive + re-anchor), never automatic.

## Transfers

EU-US DPF remains valid (General Court, 3 Sep 2025; appeal pending); build
SCC+TIA fallbacks into the processing record's `internationalTransfers`.
Prefer EU/EEA-hosted or self-hosted models; the policy makes this the default.

## ePrivacy

Evidentia injects no client-side beacons. Published pages carry no trackers.
Consent-free analytics is not available in Belgium per the APD checklist;
recommend server-side, cookie-free counting.
