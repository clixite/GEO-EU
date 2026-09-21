# Threat model — Evidentia 1.0

Method: STRIDE per trust boundary plus abuse cases specific to GEO/LLM systems.
Scope: core engine, CLI, governance console, publishing adapters, observatory,
Agent Skill, build/release pipeline. Reviewed 2026-09-18 (Clixite SRL).

## 1. Assets

| Asset | Why it matters |
|---|---|
| Customer knowledge base (documents, claims, entities) | confidential/personal data; poisoning changes what gets published |
| Provider API keys, publishing credentials, session secret, signing key | direct financial and reputational damage; forged provenance |
| Audit ledger | accountability evidence for AI Act / GDPR / audits |
| Policies and registries | decide which model may see which data |
| Published content and manifests | public statements attributed to the customer |
| Observatory data | competitive information; provider-terms exposure |

## 2. Trust boundaries and actors

```
[Internet: web pages, provider APIs, publishing targets]  ←— safeFetch, adapters —→  [Core engine + SQLite]  ←— CLI (local user) / console (HTTP) / Skill (agent)
                                                                                       ↑ policy YAML, env secrets (operator-trusted)
```
Actors: operator (admin), editor, approver, viewer; the AI agent driving the
skill (treated as an editor at most); anonymous internet (web content, HTTP to
the console); model providers (semi-trusted: their output is untrusted data).

## 3. STRIDE table

| # | Threat | Category | Boundary | Control | Residual |
|---|---|---|---|---|---|
| T1 | Poisoned web page / document injects instructions into drafting or verification | Tampering, Elevation | ingest | `security/injection.ts` scanner → quarantine; retrieval excludes quarantined; grounded prompt frames evidence as data; verification is deterministic (no LLM judge) | novel phrasings evade regexes → reviewer worklist; consider ML classifier v1.1 |
| T2 | Model output contains fabricated figures/superlatives | Tampering | provider → pipeline | `verifyDraft` requires figures/qualifiers to appear in cited evidence; gate blocks unsupported claims and placeholders | paraphrased false facts with matching numbers; human approver is the last line |
| T3 | SSRF via URL ingest, adapters or observatory | Information disclosure | outbound | `safeFetch`: https only, literal-IP and DNS range checks, redirect re-validation, host allowlist for adapters, size/time caps | DNS rebinding after lookup → egress proxy recommended |
| T4 | Confidential data sent to a non-approved model | Information disclosure | router | deny-by-default policy per data class; registry ceiling; fallback only within allowed set; `model.call_denied` audited | mis-labelled data classes by users → documented classification guidance |
| T5 | Secret leakage through logs or ledger | Information disclosure | logging | redaction of secret keys/values and prompt payloads (hash+length); ledger stores prompt hash only | secrets pasted into document content are stored as content → DSAR redaction tooling |
| T6 | Approval bypass / replay / self-approval | Elevation, Repudiation | pipeline | approvals bound to body hash, requester ≠ decider, consumed once, edits reset status | collusion between two users (organisational control) |
| T7 | Ledger tampering | Tampering, Repudiation | storage | hash chain over content and previous hash; `audit verify` gate; erasure keeps ledger | attacker with DB write access can rewrite whole chain → export head hash to external WORM store (ops runbook) |
| T8 | Cross-tenant data access | Information disclosure | storage | every query is tenant-scoped; eval `isolation`; registers keyed by tenant | shared SQLite file = shared blast radius; use one DB per tenant for strong isolation |
| T9 | Console session forgery / fixation | Spoofing | HTTP | HMAC-signed cookie, HttpOnly, SameSite=Strict, Secure on https, 8 h TTL | secret rotation invalidates all sessions (intended) |
| T10 | CSRF on mutations | Tampering | HTTP | per-session token, double submit, SameSite=Strict, `form-action 'self'` | none known |
| T11 | XSS via document titles, claims, evidence | Tampering | rendering | all dynamic text HTML-escaped; CSP `default-src 'none'`, no inline scripts; Markdown renderer escapes and blocks non-http(s) links | none known |
| T12 | Brute-force login | Spoofing | HTTP | 5 attempts / 15 min per IP; tokens compared in constant time; hashes stored | distributed attacks → proxy-level rate limiting |
| T13 | Request flooding / large bodies | DoS | HTTP, ingest | 512 KB console body cap; 8–10 MB ingest caps; fetch size/time caps | no global rate limiter in v1 → reverse proxy |
| T14 | Archive bombs / malicious files | DoS | ingest | v1 ingests text/HTML/Markdown only (no archives, no PDFs) | PDF/DOCX parsing is roadmap; will be sandboxed |
| T15 | Supply-chain compromise | Tampering | build | exact pins, lockfile, `pnpm audit`, licence gate, SBOM, gitleaks, CodeQL/Semgrep; two runtime deps in core | transitive compromise of Astro/Hono toolchains → SBOM-based monitoring |
| T16 | Malicious Skill modification | Elevation | agent | skill package verified by hash manifest (`verify-install`); scripts spawn CLI with argument arrays; no shell strings | user-installed modified copies → verify before trusting |
| T17 | Webhook/publish forgery | Spoofing | adapters | HMAC-SHA256 with timestamp; WordPress app-password over https; host pin | receiver must verify (reference implementation provided) |
| T18 | Publishing mistake (wrong content live) | Tampering | pipeline | immutable published drafts, receipts, disclosure/manifest binding; new version = new draft | unpublishing is target-specific (manual) |
| T19 | Observatory violates provider terms | Compliance | providers | official APIs only; answer hashes stored; aggregates for Gemini grounding | customers enabling `--store-raw` accept responsibility (documented) |
| T20 | Provenance key theft → forged manifests | Spoofing | filesystem | key file mode 0600, env path, rotation procedure | HSM/KMS integration roadmap |

## 4. Abuse cases (GEO-specific)

- **A1 Content farm at scale.** Mitigation: every draft needs evidence and a
  human; hard budgets; no bulk "generate 10,000 titles" feature by design.
- **A2 Manipulating AI engines with hidden instructions.** Mitigation: analyser
  penalises (H2) and the platform never emits such text; policy prohibits.
- **A3 Impersonating experts / fake quotations.** Mitigation: quotations must
  come from evidence passages; superlatives must be literal in evidence.
- **A4 Using the observatory to scrape competitors' content.** Mitigation: the
  observatory records outcomes, not answers; no crawling of competitor sites.

## 5. Security testing performed (2026-09-18)

- Unit/integration tests: ledger tampering and deletion, SSRF ranges/redirects/size,
  policy deny paths, router fallback containment, approval four-eyes/hash/replay,
  quarantine exclusion, tenant isolation, console auth/CSRF/RBAC/forged cookie,
  injection dataset. See `pnpm test` and `evidentia evals run`.
- Static analysis and scans: configured in CI (CodeQL, Semgrep, gitleaks,
  `pnpm audit`, licence gate). Local gitleaks run before release (docs/RELEASE.md).
- Manual review: authentication and authorisation paths in `apps/admin/src/app.ts`.

## 6. Open items

- Egress proxy guidance and Docker hardening (docs/OPERATIONS.md).
- OIDC/MFA for the console; PostgreSQL adapter; PDF/DOCX ingestion sandbox.
- External anchoring of the ledger head hash (scheduled export).
