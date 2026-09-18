# Evidentia 1.0.0 — Final report

Date: 2026-09-18 · Branch: `feat/evidentia-v1` · Built and maintained by Clixite SRL — Belgium.

## Product

**Evidentia** is a governed Generative Engine Optimization (GEO/AEO) platform
and Agent Skill for European organisations. It turns an organisation's own
documented knowledge into content that AI answer engines can retrieve and cite,
gates every publication behind deterministic evidence checks and four-eyes human
approval, publishes with a visible AI disclosure and a signed provenance manifest,
and measures brand visibility across AI engines with repeated sampling and
confidence intervals. It ships as:

- `packages/core` — the engine (TypeScript, Node ≥ 24, embedded SQLite; runtime deps: `zod`, `yaml`);
- `packages/cli` — the `evidentia` command (JSON output, meaningful exit codes);
- `apps/admin` — a server-rendered governance console (CSP without scripts, RBAC, CSRF, rate-limited login);
- `skill/evidentia` — a Claude Code Agent Skill in the open Agent Skills layout (mode routing, 10 references, 7 cross-platform scripts, tests, install/verify/rollback);
- `website` — a static, English-only public site (25 pages, no client scripts);
- `governance/` — the EU default policy and a 68-entry primary-source register;
- `demo/` — a fictional Belgian bank dataset for an offline end-to-end run.

Everything is English-only. Nothing is presented as certified, approved, or
endorsed; the website and docs describe controls, evidence and responsibilities.

## Architecture

Framework-free core with append-only migrations on `node:sqlite` (FTS5 for
BM25, vectors as BLOBs, `secure_delete`), a hash-chained audit ledger, a
redacting structured logger, a policy engine reading YAML, registers (models,
AI systems, processing records), payload-bound approvals, Ed25519 provenance,
SSRF-hardened outbound HTTP, model-agnostic adapters (Anthropic, OpenAI-
compatible, Google, local, demo) behind a policy-aware router with cost metering,
knowledge extraction (HTML/Markdown → chunks, claims, entities) with prompt-
injection quarantine, hybrid retrieval with reciprocal rank fusion and citations,
a `readiness-v1` GEO analyser, grounded prompting with deterministic
verification, a publishing pipeline with static/WordPress/signed-HTTP targets,
an observatory with Wilson intervals, and a deterministic evals runner. ADRs
0001–0005 record the decisions (identity, stack, clean room, native Node +
SQLite, deterministic verification before judgement). See docs/ARCHITECTURE.md.

## Upstream relationship

GEOFlow (yaojingang/GEOFlow @ `9ed2fe80…`, 3.2.0-beta.1, AGPL-3.0-only) was
inspected statically (docs/UPSTREAM_ANALYSIS.md, 494 lines: architecture,
data model, RAG, quality gates, distribution, visibility, security, governance,
skill, KEEP/IMPROVE/REPLACE/REMOVE/ADD, feature matrix, licensing). Evidentia
is a clean-room TypeScript implementation: **no code, prompts, regex tables,
schemas, templates, assets or documentation text were copied** (ADR-0003,
docs/UPSTREAM_LICENSING.md). Kept as ideas: knowledge → gate → human review →
distribution → analytics; content fingerprints; SSRF policy; receipts.
Replaced: Laravel/PHP monolith with a small Node core; LLM-judge quality gate
with deterministic verification; Chinese-only visibility probes (Doubao,
DeepSeek) with EU-allowed providers through official APIs; two-role admin with
RBAC and four-eyes; WSL-only Bash skill helpers with cross-platform Node scripts.
Added: provider data-policy metadata and deny-by-default routing, AI system
register, Article 50 marking and disclosure, GDPR tooling (DSAR find/redact,
export, erasure, retention), quarantine, evals as release gates, SBOM/licence
gates, evidence-tiered GEO methodology, Wilson-interval measurement.

## Major improvements (measurable)

| Area | Upstream (from analysis) | Evidentia 1.0 |
|---|---|---|
| Runtime deps | Laravel 12 + Horizon + Reverb + pgvector + Redis; 889 PHP files | 2 runtime deps in core; 316 total lockfile packages incl. build tooling |
| Provider data policy | absent | hosting/retention/training/DPA/ZDR on every model; policy deny-by-default per data class |
| Quality gate | LLM reviewer (ScorerV2) + regex risk scan | deterministic claim verification (figures, qualifiers, overlap) + policy gate; LLM judgement optional and labelled |
| Human approval | manual override / auto-release | four-eyes, hash-bound, single-consumption, edit voids approval |
| Audit | admin activity log (mutations only) | hash-chained ledger covering policy, model calls, approvals, publications, DSAR, retention |
| Visibility | Chinese providers, raw answers stored indefinitely | official EU-allowed APIs, answer hashes, Wilson intervals, series breaks |
| GDPR tooling | none | DSAR find/redact, processing records, retention, export, erasure |
| AI Act Art. 50 | `is_ai_generated` never rendered | visible notice + IPTC/JSON-LD/meta + signed manifest with editorial responsibility |
| Prompt injection | regex quarantine in RAG evidence | deterministic scanner at ingest + analyser penalty + benign/positive eval cases |
| Skill portability | Bash/WSL-only helpers, Codex installer | plain Node scripts on Windows/macOS/Linux; install/verify/uninstall with backups |

## EU governance

Primary-source research (docs/EU_GOVERNANCE.md, governance/sources.yaml — 68
official sources with dates) produced applicability verdicts: AI Act
applicable (provider + deployer, not high-risk, Art. 50 in force since 2 Aug
2026), GDPR applicable, copyright applicable/requires-legal-assessment, CRA
applicable to the self-hosted product (reporting live since 11 Sep 2026), NIS2
customer-specific, ePrivacy applicable to injected client-side measurement
(none), DSA potentially applicable at hosting tier only, EAA customer-specific,
Data Act applicable to SaaS, provenance standards as the technical route.
Implemented controls: AI system register (role, risk reasoning, oversight,
review dates), model registry, policy engine, Art. 50 marking and disclosure,
human-review route with named editorial responsibility, records of processing,
DPIA outline, DSAR tooling, retention, export, erasure, no trackers. Claims we
do not make are listed on the EU readiness page and in docs.

## Security

Threat model (STRIDE + abuse cases, 20 threats, docs/THREAT_MODEL.md) and
security architecture (docs/SECURITY_ARCHITECTURE.md). Controls tested in code:
ledger tampering/deletion detection; SSRF address classes, redirect targets,
size caps, host allowlists; policy deny paths and fallback containment;
four-eyes, hash binding and replay of approvals; quarantine exclusion; tenant
isolation; forged session cookies, CSRF, role escalation, rate limiting; an
injection dataset. Scans run 2026-09-18: `gitleaks detect` — no leaks (test
fixtures allow-listed in `.gitleaks.toml` with justification); `pnpm audit
--audit-level=high` — no known vulnerabilities; licence gate — 0 unknown / 0
disallowed (platform-optional binaries reported as not installed); CycloneDX
1.5 SBOM — 316 components with SHA-512 hashes. CodeQL and Semgrep run in CI
(not executed locally: tools absent). Independent adversarial review:
docs/reviews/ADVERSARIAL_REVIEW.md — findings and their resolution are
summarised in the section below.

Documented residual risks: DNS rebinding after lookup (use an egress proxy),
no built-in MFA/SSO (identity-aware proxy), regex-based injection detection
(reviewer worklist + deterministic verifier), SQLite single-node, filesystem
signing key (HSM/KMS planned), text watermarking is provider-side.

## GEO methodology

docs/GEO_METHODOLOGY.md tiers 31 techniques (A-conditional, B, C, D, E) with
sources accessed 2026-09-18, a folklore list, a measurement protocol (7–8
repeats × 3–5 paraphrases × engine × language; Wilson intervals; provider-terms
table), and the `readiness-v1` model (Retrievability 30, Evidence 25,
Provenance 20, Structure 10, judged Quality 15, Hygiene −15, Off-site 0,
D/E informational). The analyser implements exactly that; each check carries
its tier and methodology reference; weights are versioned and published on the
website as a product design choice, not a finding.

## Skill

`skill/evidentia`: SKILL.md (control plane; 15 modes; guardrails), references
(architecture, geo-methodology, retrieval, content-governance, eu-ai-act,
privacy, security, publishing, evaluation, operations), scripts
(check-environment, analyze-url, readiness-digest, policy-precheck, install,
verify-install, uninstall), evals (trigger cases, file manifest, 6 script
tests), assets (templates). Install: `node skill/evidentia/scripts/install.mjs
--scope user|project [--agents]`; verify: `verify-install.mjs`; remove:
`uninstall.mjs` (backups kept). Validated commands only.

## Website

Astro static build, 25 pages: home, product, GEO/AEO, AI visibility, trusted
knowledge, governance, EU readiness, security, architecture, installation, use
cases, why, FAQ, changelog, licence, privacy, legal, contact, docs (index,
getting started, CLI, skill, policies, full methodology, full governance).
JSON-LD (Organization, WebSite, SoftwareApplication, page type, breadcrumbs,
FAQPage), canonical URLs, sitemap, robots, llms.txt with an honest status note,
OG metadata, AI-assistance disclosure, no client JavaScript, no trackers.
Design pass applied (docs/DESIGN.md). Lighthouse (local, Chromium):
home, geo-aeo, eu-readiness, docs/cli — Performance 100, Accessibility 100,
Best Practices 100, SEO 100. Deployment: `website/dist` to any static host
(Apache `.htaccess` for clean URLs included). Not deployed in this session —
no hosting target was designated; Hostinger/Vercel connectors are available.

## Adversarial review

Before this report was finalised, an independent agent red-teamed the tree in
`docs/reviews/ADVERSARIAL_REVIEW.md` and returned 0 critical, 9 high, 15 medium
and 8 low findings (32 total). No unauthenticated remote code execution or
cross-tenant read was found; the substantive problems were in the governance
*guarantees* — erasure, redaction, publication-gate strictness, marking
enforcement and a few defence-in-depth gaps — rather than in access control.

All 9 high findings and the medium findings with a concrete exploit path were
fixed, each with a regression test that fails on the pre-fix code:

- **Erasure and redaction (F-01, F-02, F-03).** `eraseTenant` deleted `drafts`
  before `publications` and `query_sets` before `observations`, both of which
  fail their foreign key with `PRAGMA foreign_keys = ON` — it threw for any
  tenant that had published or been observed. `chunks_fts` was orphaned rather
  than deleted, leaving searchable full text behind after "erasure". `dsar
  redact` missed document titles, chunk heading paths (and their FTS mirror)
  and source title/owner. Fixed: erasure now runs in FK-safe dependency order
  and clears `chunks_fts` by tenant; redaction reaches every location DSAR
  `find` reports. Regression test:
  `packages/core/test/governance/retention-erasure.test.ts` builds a tenant
  with rows in every governed table (ingested knowledge, a published draft, an
  observatory run, a live approval, one row per register) and asserts erasure
  succeeds and clears all of it; `store-retrieval.test.ts` proves title/heading/owner
  redaction directly.
- **Stored XSS in published JSON-LD (F-04).** The provenance manifest and the
  website's page JSON-LD were embedded with a bare `JSON.stringify` inside a
  `<script type="application/ld+json">` tag — a title or editorial name
  containing `</script>` would break out of the script context. Fixed with a
  `jsonForScript` escaper (`<`/`>`/`&`/line separators) used at
  both embedding sites; tested directly and via a build+e2e pass.
- **Verifier gaps and an overstated claim (F-05).** The deterministic verifier
  ignored headings, sentences under four words, and did not check that a
  proper noun, unit, or negation in a claim actually appeared in the cited
  evidence — a claim could be shown as "supported" after a subject swap, a unit
  swap or a flipped negation. Fixed: the verifier now checks proper nouns,
  figure units/periods and negation agreement against the best-matching
  evidence sentence, and treats short/heading sentences as claims too. The
  website's "Zero unsupported claims" copy was changed to the accurate "Unsupported
  claims block publication".
- **Injection detection and quarantine scope (F-06).** Patterns were English-only,
  CSS-hidden text was ingested as if visible, and a quarantined (suspected
  poisoned) document was still mined for claims and entities even though its
  chunks were excluded from retrieval. Fixed: patterns now cover French,
  German, Dutch, Spanish and Italian phrasings plus zero-width-character
  normalisation; `hidden`/`display:none`/`font-size:0` elements are dropped
  from extracted text; claim/entity extraction is skipped for quarantined
  documents and run retroactively only when a reviewer releases one.
- **Marking enforcement and disclosure attribution (F-07).** Policy could
  require machine-readable Art. 50 marking, but nothing enforced it — publishing
  without a configured signing key silently published without a manifest.
  Fixed: `publish()` now refuses when the policy requires marking and no
  signing key is configured, and the manifest's editorial-responsibility field
  records the actual approver, not just a free-text name.
- **Rate limiting on the console (F-08).** The login rate limiter keyed on a
  client-supplied `X-Forwarded-For` header (trivially bypassed by rotating the
  header) with an unbounded map and no minimum token length. Fixed: the limiter
  uses the real connection address unless the deployment explicitly opts into
  a trusted-proxy header, the map is capacity-bounded with eviction, and tokens
  under 24 characters are rejected before any hash comparison.
- **Four-eyes bound to the wrong actor (F-09).** Approval decisions excluded
  only the approval's own requester, not the draft's author or editors — an
  author could route the gate through a colleague, then approve their own
  content later via a second gate cycle. CLI actors were also unauthenticated
  free text. Fixed: `decide()` now excludes every contributor recorded in the
  ledger for the object (author plus anyone who edited it), not only the
  requester; the CLI actor-as-identity limitation is documented (Remaining
  limitations, below) rather than silently left implicit.
- **Approval consumed before the adapter call, and a transaction bug found
  while fixing it (F-10).** A failed publish still burned the approval, so a
  transient adapter failure required a brand-new human approval to retry.
  Fixed: the approval is validated before the adapter call and consumed only
  after it succeeds. While adding 30-day approval expiry for this fix, a real
  bug surfaced: the expiry write and the subsequent conflict check were in the
  same SQL transaction, so a throw on the conflict check rolled the expiry
  itself back, leaving a stale approval marked "pending" forever. Caught by a
  new regression test before it shipped; the expiry check now commits outside
  the transaction it gates.
- **Readiness gate had a dead fallback (F-11).** `readinessScore ?? 100`
  meant an unassessed draft always cleared the readiness threshold. Fixed:
  `verify()` now scores the rendered artefact with the same analyser the
  standalone `analyze` command uses, and the policy gains a `readinessUnknown`
  option for treating "not assessed" explicitly rather than optimistically.
- **Cost budgets and Perplexity/observatory correctness (F-16, F-19).**
  Budgets were never wired to an environment variable, so cost governance did
  nothing until an operator hand-wrote code; an unpriced model's calls were
  invisible to a euro-denominated budget. Fixed: `EVIDENTIA_BUDGETS` (JSON) is
  parsed at runtime start, and budgets gained an optional `maxCalls` ceiling
  for unpriced models. Separately, the observatory conflated a citation the
  provider's own tool returned with a URL merely typed in the answer text
  (which a model can fabricate without retrieving anything), didn't parse
  Perplexity's Sonar citation formats, and aborted an entire multi-model run on
  the first policy-denied model. Fixed: `detectCitations` now reports
  `toolCited`/`textLinked` separately and only `toolCited` counts toward the
  visibility metric; the OpenAI-compatible adapter parses Perplexity's
  `citations`/`search_results` response fields; a denied model is recorded and
  skipped while the rest of the run continues.
- **Licence-gate logic error and a provider key-exfiltration gap (F-18, F-23).**
  The SPDX-expression check treated `AND` and `OR` identically (`.some()`),
  so `"GPL-3.0 AND MIT"` passed because `MIT` matched — the gate would not have
  caught a genuinely disallowed combined-licence dependency. A real instance
  surfaced once fixed: `@img/sharp-win32-x64`'s `Apache-2.0 AND LGPL-3.0-or-later`
  now fails correctly; LGPL-3.0-or-later was reviewed and allow-listed for this
  specific, unmodified-dynamic-binary use (see the comment in
  `scripts/licenses.ts`). Separately, a model-registry entry could point a
  well-known provider's `endpoint` at an arbitrary host and have that
  provider's shared API key sent there; `buildAdapters` now refuses an
  untrusted host for the vendor ids it knows about, while leaving genuinely
  self-hosted provider ids unrestricted.
- **Installer/uninstaller destructiveness and admin hardening (F-24, plus
  console hardening from F-08/F-21).** `install.mjs --target-dir` and
  `uninstall.mjs --target-dir` renamed whatever directory they were pointed at
  without checking it was actually a prior skill install. Fixed: both refuse a
  non-empty target that has no `SKILL.md`. The console's `/healthz` also
  switched from a full ledger walk to a cached verification that only
  re-walks when the head has changed, a chunked request with no
  `Content-Length` is now refused rather than bypassing the body-size guard,
  and the `Secure` cookie/HSTS decision uses the same trusted-proxy logic as
  the rate limiter instead of trusting the raw request URL.

Findings left as documented limitations rather than code changes (none change
a security or governance guarantee; each is called out explicitly rather than
silently accepted): PII appearing in ledger payloads for legitimate
accountability records is a deliberate design boundary, now documented in
`docs/GDPR.md` § ledger; the CLI's `--actor` flag remains a self-reported
string with no authentication (the console's session-based auth is the
authenticated surface; CLI use is assumed to run under an already-trusted
operator identity, documented in `docs/OPERATIONS.md`); DNS-rebinding and
regex-based injection detection remain residual risks called out below, not
solved by this pass. The 3 remaining low-severity findings (source-suffix
allowlist matching, a CI action pinned by tag rather than digest, no session
revocation list) are tracked for 1.1 and do not affect the guarantees the
product states today.

## Testing (executed 2026-09-18, after the adversarial-review fixes)

| Suite | Result |
|---|---|
| `packages/core` node:test (ledger incl. cached verification, logger, storage, policy, registers, approvals incl. expiry and multi-contributor four-eyes, SSRF, router, embeddings, adapters incl. endpoint allow-listing, demo provider, extraction, store/retrieval incl. quarantine extraction timing and full-scope redaction, robots/stats, analyser, grounding/provenance incl. JSON-LD escaping, pipeline/adapters/retention incl. full-tenant erasure, observatory incl. denial handling, evals runner) | 89 / 89 pass |
| `packages/cli` node:test (arg parsing, exit codes, init/status/audit/policy/denial, validation) | 5 / 5 pass |
| `apps/admin` node:test (headers, login failure audit incl. short-token rejection, rate limit, forged cookie, CSRF incl. missing-Content-Length refusal, RBAC, end-to-end approval flow, readiness form) | 5 / 5 pass |
| `skill/evidentia/evals` (package validity, triggers, references, digest, install→verify→uninstall incl. unrelated-directory refusal, preflight) | 7 / 7 pass |
| `evidentia evals run` (readiness 4, governance 21, grounding 6, retrieval 3) | 34 / 34 pass |
| `scripts/smoke.ts` (18-step offline CLI flow: SOURCE → KNOWLEDGE → ANALYSIS → DRAFT → EVIDENCE → GATE → APPROVAL → PUBLISH → VISIBILITY → REPORT, incl. negative cases and the updated non-throwing policy-denial step) | pass |
| Playwright (console critical flow across two users, security headers, forged cookie, CSRF, axe; website structure, JSON-LD, sitemap/robots/llms.txt, keyboard, axe WCAG 2.2 AA, responsive) × chromium + mobile | 18 / 18 pass |
| Lighthouse (4 pages, audited 2026-09-18) | 100 / 100 / 100 / 100 each |
| `pnpm typecheck` (core, cli, admin; website via build) | clean |
| gitleaks · pnpm audit · licence gate (SPDX AND/OR now evaluated correctly) · SBOM | clean · clean · ok (0 disallowed, 1 knowingly allow-listed) · generated |

## Remaining limitations

- No PostgreSQL/pgvector backend (SQLite only; brute-force vector search).
- Ingestion covers HTML, Markdown and text; no PDF/DOCX.
- Console has no OIDC/MFA; deploy behind an identity-aware proxy.
- Injection detection is regex-based across six languages; novel phrasings or
  further languages still need reviewer release from quarantine.
- Provider adapters were tested against recorded API shapes with fake fetch,
  not against live vendor endpoints (no API keys in this environment).
- Observatory: Gemini API terms restrict link-level monitoring; aggregates only.
- Website not deployed; trademark clearance for "Evidentia" pending; legal
  notice fields (company/VAT numbers) to be completed by Clixite.
- Lighthouse and Playwright ran locally on Windows; CI (CodeQL, Semgrep) runs
  on push to GitHub and has not yet executed at the time of writing.
- Ledger archiving with re-anchoring is a documented operator procedure, not
  automated; ledger payloads are designed to avoid free-text personal data,
  but a legitimate accountability record (an approver's name) is retained
  under the ledger's own retention policy, not erasable via DSAR redaction
  (see `docs/GDPR.md` § ledger).
- The CLI's `--actor` is a self-reported, unauthenticated string; treat CLI
  access itself as the trust boundary (run it only as an already-authenticated
  operator), not a substitute for the console's session-based RBAC.
- DNS rebinding between address validation and connection is mitigated
  (re-resolution is not trusted blindly) but not eliminated; use an egress
  proxy on genuinely hostile networks.

## Next recommended version (1.1)

PostgreSQL adapter; PDF/DOCX ingestion in a sandbox; OIDC/MFA; ML-based
injection classifier alongside the regex scanner; ledger head-hash anchoring
job; release-manifest generation in CI; live-API contract tests behind secrets;
optional Wikidata/YouTube off-site context module; dark theme with paired tokens.
