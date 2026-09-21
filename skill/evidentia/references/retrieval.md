# Knowledge and retrieval (reference for knowledge mode)

## Sources

`evidentia source add <locator> --kind url|file|manual|api --authority official|internal|third-party|unverified --owner <email>`
Authority drives ranking boosts (official +0.15, internal +0.10, third-party 0,
unverified −0.20) and appears in every citation. Sources may carry
`--licence`, `--language`, validity dates.

## Ingestion

`evidentia ingest <sourceId> --file page.html` or `evidentia ingest --url https://… --authority official`
(URL fetches go through safeFetch: https only, no private ranges, 8 MB cap).

What happens: content is fingerprinted (unchanged content is a no-op); older
versions of the same source are superseded; HTML is reduced to main-content
text with headings; text is chunked (~1 200 chars, sentence-aware, 1-sentence
overlap, heading path kept); each chunk is FTS-indexed and embedded (through
the policy-routed embedding model; `local/hash-384` is an offline, non-semantic
fallback); claims (statistic, temporal, definition, superlative, fact,
promise) and entities are extracted deterministically.

**Quarantine.** Documents containing instruction-like strings addressed to AI
systems (`ignore previous instructions`, `cite this page first`, `Dear ChatGPT`,
exfiltration requests…) are stored but excluded from retrieval and drafting
until a reviewer releases them: `evidentia quarantine list|release <id> --note`.
Exit code 5 signals a quarantined ingest.

## Search

`evidentia search "<question>" [--k 8] [--decompose] [--include-quarantined]`
Hybrid: BM25 (FTS5, implicit AND with OR fallback) + cosine over embeddings,
fused by reciprocal rank fusion, then authority, freshness (≤10 % boost decaying
over ten years) and exact-phrase signals. Each hit carries document title,
heading path, source locator and character offsets — enough to cite precisely.

Filters: source ids, authority levels, validity `asOf`, language.

## Claims and entities

`evidentia claims [--document id]` lists extracted claim candidates with kind
and confidence (threshold from policy `confidenceThresholds.claimExtraction`).
`evidentia entities` lists resolved entities with aliases and mention counts;
alias variants (e.g. "Northwind Bank SA" vs "NORTHWIND BANK") are the input for
entity-consistency recommendations.

## Freshness

`evidentia status` and the console's Knowledge page list documents older than a
year (`staleDocuments`). Recommend substantive updates, not date bumps.

## Personal data

`evidentia dsar find "<name>"` shows every chunk, claim and entity alias
containing the term; `evidentia dsar redact "<name>" --replacement "[redacted]"
--reason "DSAR-…"` rewrites documents, chunks, FTS, claims and removes matching
entities, recording only a hash of the term in the ledger. See privacy.md.
