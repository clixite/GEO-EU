# Evidentia

**Governed generative visibility for European organisations.**
*Be cited on evidence, not tricks.*

Built and maintained by **Clixite SRL — Belgium**.

---

Generative engines now answer questions your customers, regulators and
journalists used to put to a search box. If your organisation wants to be the
source those answers cite, the content that earns that citation has to be
retrievable, verifiable and traceable back to something true — and, if your
organisation operates under EU law, every step from "we published this" to
"an AI system said this about us" has to survive a compliance review, not
just a marketing review.

Evidentia is a self-hosted GEO/AEO (Generative Engine Optimization / Answer
Engine Optimization) platform built for that second bar. It turns an
organisation's own documented knowledge into content that AI answer engines —
ChatGPT, Claude, Perplexity, Gemini, Copilot — can retrieve and cite, gates
every publication behind deterministic evidence checks and human approval,
publishes with a visible AI disclosure and a signed provenance manifest, and
measures brand visibility across AI engines with repeated sampling and
confidence intervals. All of it runs under an EU governance layer: a policy
engine, model/AI-system/processing registers, and a hash-chained audit
ledger. This repository is the product — engine, CLI, governance console,
governance policies and public website, source-available for evaluation.

[![CI](https://github.com/clixite/GEO-EU/actions/workflows/ci.yml/badge.svg)](https://github.com/clixite/GEO-EU/actions/workflows/ci.yml)
[![Licence: proprietary / source-available](https://img.shields.io/badge/licence-proprietary%20%2F%20source--available-blue)](LICENSE)
[![Node.js >= 24](https://img.shields.io/badge/node-%3E%3D24-339933)](package.json)

Version 1.0.0 (first release, 2026-09-18) · monorepo package `evidentia-monorepo` · product name working, trademark clearance pending.

## The governance case

Most GEO tooling optimises for engagement with the model: more content, more
frequently, tuned to whatever gets picked up. That approach does not survive
contact with a security or legal review at a regulated organisation, because
it produces no answer to "who approved this claim, on what evidence, and can
you show me the trail." Evidentia is built around that question instead of
around publishing volume:

| A reviewer will ask | Evidentia's mechanism | Where to check it |
|---|---|---|
| Can an AI provider ingest our data for training, or retain it, without us knowing? | Model registry records hosting, retention, training-use and DPA/zero-retention status per provider; deny-by-default policy blocks any model not cleared for the data class in play | [docs/MODEL_GOVERNANCE.md](docs/MODEL_GOVERNANCE.md), [docs/DATA_GOVERNANCE.md](docs/DATA_GOVERNANCE.md) |
| Is published content actually true, or just plausible? | Deterministic verification checks figures, units/periods, proper nouns and negation against the cited evidence before the publication gate opens — not word-overlap scoring | [docs/GEO_METHODOLOGY.md](docs/GEO_METHODOLOGY.md) |
| Who signed off on this, and can that be forged after the fact? | Four-eyes approval bound to the exact content hash, excluding every recorded contributor (not just the requester), expiring after 30 days | [docs/EU_GOVERNANCE.md](docs/EU_GOVERNANCE.md) |
| Can the approval trail be edited quietly later? | Append-only, hash-chained audit ledger with cached verification | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Does this meet EU AI Act marking obligations for AI-generated content? | Visible AI disclosure plus an Ed25519-signed provenance manifest (Art. 50 marking route); publishing refuses outright if marking is policy-required and no signing key is configured | [docs/AI_ACT.md](docs/AI_ACT.md) |
| Can a data subject get their data found and removed from what we published? | DSAR find/redact reaches chunk text, headings, document titles and source fields | [docs/GDPR.md](docs/GDPR.md) |
| What stops a poisoned document from steering the model? | Regex-based prompt-injection quarantine across English, French, German, Dutch, Spanish and Italian, with zero-width-character normalisation | [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) |
| Has anyone actually tried to break this before we did? | Independent adversarial review before release: 0 critical findings, 9 high-severity findings, all fixed with regression tests before merge | [docs/reviews/ADVERSARIAL_REVIEW.md](docs/reviews/ADVERSARIAL_REVIEW.md), [FINAL_REPORT.md](FINAL_REPORT.md) § Adversarial review |

None of this is a compliance certification and Evidentia does not claim to be
deployed, audited or certified anywhere — these are mechanisms built into the
software, described precisely, with the code and the docs to check them
against.

## How content moves through the system

```
TRUSTED KNOWLEDGE → STRUCTURED UNDERSTANDING → EVIDENCE-GROUNDED CONTENT → GOVERNANCE GATES
→ HUMAN ACCOUNTABILITY → DISTRIBUTION → AI DISCOVERABILITY → MEASUREMENT → CONTINUOUS IMPROVEMENT
```

What this pipeline explicitly refuses to do: spam, fabricated expertise, fake
citations, hidden text, mass low-quality pages, or manipulation of AI
retrieval systems.

## What ships in this repository

| Component | What it is |
|---|---|
| `packages/core` | The domain engine — TypeScript on Node 24, `node:sqlite`, minimal dependencies (`zod`, `yaml`) |
| `packages/cli` | The `evidentia` command-line interface |
| `apps/admin` | The governance console — server-rendered with Hono, no client-side JavaScript |
| `website` | The public site — static Astro build, no client-side JavaScript |
| `skill/evidentia` | A Claude Code Agent Skill, packaged in the open Agent Skills layout |
| `governance/` | EU policy definitions and a 68-source primary-source register |
| `demo/` | A fictional dataset ("Northwind Bank SA") for a fully offline demo |

## Governance and trust architecture

- **Policy engine.** YAML policies enforce deny-by-default model access per
  data class and gate publication behind configurable thresholds — a model
  or a piece of content has no default path to production.
- **Registers.** A model registry (hosting, retention, training use, DPA and
  zero-retention status per provider), an AI system register, and Art.
  30-style processing records.
- **Human accountability.** Four-eyes approvals bound to the exact content
  hash, excluding every recorded contributor rather than only the requester,
  expiring after 30 days if unused.
- **Audit ledger.** Hash-chained, append-only, with cached verification — the
  record of what happened cannot be quietly rewritten.
- **Marking and provenance.** Visible AI disclosure on published content plus
  an Ed25519-signed provenance manifest, following the AI Act Art. 50 marking
  route. Publishing refuses outright when marking is policy-required and no
  signing key is configured — it fails closed, not silently.
- **Cost governance.** Metered calls, budgets with soft-alert and hard-block
  thresholds (including a call-count ceiling for unpriced models), and
  policy-constrained routing strategies (quality / cost / latency), all
  configured through `EVIDENTIA_BUDGETS`.

Full detail: [docs/EU_GOVERNANCE.md](docs/EU_GOVERNANCE.md),
[docs/AI_ACT.md](docs/AI_ACT.md), [docs/GDPR.md](docs/GDPR.md),
[docs/MODEL_GOVERNANCE.md](docs/MODEL_GOVERNANCE.md),
[docs/DATA_GOVERNANCE.md](docs/DATA_GOVERNANCE.md).

## Capabilities

| Area | What it does |
|---|---|
| Trusted knowledge | Sources carry owners and authority levels; documents are content-addressed; claims and entities are extracted; prompt-injection quarantine covers six European languages with zero-width normalisation; DSAR find/redact reaches chunk text, headings, titles and source fields |
| Retrieval | BM25 and embeddings fused by reciprocal rank fusion, weighted by authority and freshness signals, with citations carrying character offsets |
| GEO readiness | The `readiness-v1` analyser runs evidence-tiered checks (A-conditional through E), evaluates `robots.txt` per AI agent against RFC 9309, applies penalties, and scores informational items at zero weight |
| Grounded drafting | Numbered evidence with mandatory citation markers; placeholders instead of invented facts; deterministic verification of figures, units/periods, proper nouns and negation against the cited evidence |
| Governance | Deny-by-default YAML policies, model registry with data-policy metadata, AI system register, Art. 30-style processing records |
| Human accountability | Four-eyes approvals bound to content hashes with 30-day expiry; hash-chained, append-only audit ledger |
| Publishing | Static export, WordPress REST, and signed HTTP adapters; visible AI disclosure; Ed25519-signed provenance manifests; fail-closed when marking is required |
| AI visibility observatory | Versioned query sets sampled repeatedly through official provider APIs only — never by scraping chat UIs — with Wilson score confidence intervals, series-break detection on model version changes, and a distinction between tool-cited and text-linked citations |
| Cost governance | Metered calls, soft-alert/hard-block budgets, policy-constrained routing by quality, cost or latency |
| Evaluation | 34 deterministic test cases across readiness, governance/policy, grounding and retrieval, run as a release gate via `evidentia evals run` |

## Security posture

- Deny-by-default model access per data class, with policy-constrained
  fallback that never silently escalates to an unapproved provider.
- SSRF-hardened outbound HTTP: private-range blocking, redirect/size/time
  caps, host pinning.
- Prompt-injection scanning with quarantine of poisoned documents, across
  six European languages.
- Deterministic claim verification (figures, units, entities, negation)
  ahead of every publication gate.
- Four-eyes approvals bound to content hashes, single-use, 30-day expiry.
- Hash-chained, append-only audit ledger.
- Secrets read from the environment only, never logged; the logger redacts
  secrets and full prompt/response payloads by both key and length.
- Governance console: signed, HttpOnly, `SameSite=Strict` sessions,
  CSRF double-submit protection, a strict CSP with no scripts, RBAC, and
  login rate limiting keyed on the real connection address rather than a
  spoofable header, with a minimum 24-character token length.
- Supply chain: exact-pinned dependencies, committed lockfile, `pnpm audit`,
  a licence allow-list, a CycloneDX SBOM, gitleaks, Semgrep and CodeQL.

CodeQL runs in CI but is currently **non-blocking**, because GitHub Advanced
Security is not purchased on this account — its output is informative, not a
security guarantee, and nothing here implies a paid certification of any
kind.

An independent adversarial (red-team) review was carried out before release:
**0 critical findings**; **9 high-severity findings, all fixed with
regression tests before merge**. That is a factual result, stated as such —
not "zero vulnerabilities" and not "fully secure."

Full write-ups: [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md),
[docs/SECURITY_ARCHITECTURE.md](docs/SECURITY_ARCHITECTURE.md),
[SECURITY.md](SECURITY.md).

## Independent verification

Re-run 2026-09-21, reproducible from a clean checkout:

| Suite | Result |
|---|---|
| `packages/core` unit/integration tests (`node:test`) | 92 / 92 pass |
| `packages/cli` tests (`node:test`) | 5 / 5 pass |
| `apps/admin` tests (`node:test`) | 5 / 5 pass |
| `skill/evidentia` evals (`node:test`) | 7 / 7 pass |
| `evidentia evals run` (readiness 4, governance 21, grounding 6, retrieval 3) | 34 / 34 pass |
| `scripts/smoke.ts` — 18-step offline CLI flow | 18 / 18 steps |
| Playwright e2e — console + website, Chromium + mobile viewport | 18 / 18 pass |
| `pnpm typecheck` — core, CLI, admin, website | clean |
| gitleaks / `pnpm audit` / licence gate (SPDX AND/OR aware) / CycloneDX SBOM | clean / clean / ok / generated |

CI (`.github/workflows/ci.yml`, GitHub Actions) runs on every push and every
pull request across five jobs: typecheck + unit/integration tests + evals;
website and admin build; Playwright browser tests; supply-chain checks
(audit, licences, SBOM, gitleaks); and static analysis (Semgrep enforced,
CodeQL non-blocking as noted above).

## Quick start

Fully offline, no API keys required.

Requirements: Node.js ≥ 24, pnpm ≥ 10.

```bash
pnpm install --frozen-lockfile
node packages/cli/bin/evidentia.mjs init --db ./.evidentia/demo.db --tenant demo
node packages/cli/bin/evidentia.mjs demo load --db ./.evidentia/demo.db --tenant demo
node packages/cli/bin/evidentia.mjs search "how long are support recordings kept" --db ./.evidentia/demo.db --tenant demo
```

Full walkthrough: [docs/INSTALLATION.md](docs/INSTALLATION.md).
Demo dataset details: [demo/README.md](demo/README.md).

### Governance console

```bash
pnpm --filter @evidentia/admin start
```

Requires `EVIDENTIA_ADMIN_SECRET` (32+ characters) and `EVIDENTIA_ADMIN_USERS`
to be set first — see [docs/OPERATIONS.md](docs/OPERATIONS.md) for how to
generate and configure them. There is no default secret; the console will
not start without one.

### Agent Skill install

```bash
node skill/evidentia/scripts/install.mjs --scope user|project
```

## Repository layout

```
packages/core     domain engine (TypeScript, Node 24, node:sqlite; deps: zod, yaml)
packages/cli      the `evidentia` CLI
apps/admin        governance console (Hono, server-rendered, no client JS)
website           public site (Astro, static, no client JS)
skill/evidentia   Claude Code Agent Skill (open Agent Skills layout)
governance/       policies/*.yaml + sources.yaml (68 primary EU sources)
evals/datasets    deterministic evaluation datasets
demo/             fictional "Northwind Bank SA" demo dataset
tests/e2e         Playwright browser tests (console + website)
scripts/          smoke flow, SBOM (CycloneDX 1.5), licence gate
docs/             architecture, methodology, governance, threat model, ADRs
```

The public website (`website/`, Astro, 25 pages) is included as source. It
has not been deployed to a live URL — this repository is the product.

## Documentation

- [Product](docs/PRODUCT.md) · [Architecture](docs/ARCHITECTURE.md) · [Installation](docs/INSTALLATION.md) · [Operations](docs/OPERATIONS.md) · [Release](docs/RELEASE.md)
- [GEO methodology](docs/GEO_METHODOLOGY.md) · [Evaluation](docs/EVALUATION.md)
- [EU governance](docs/EU_GOVERNANCE.md) · [AI Act](docs/AI_ACT.md) · [GDPR](docs/GDPR.md) · [Model governance](docs/MODEL_GOVERNANCE.md) · [Data governance](docs/DATA_GOVERNANCE.md)
- [Threat model](docs/THREAT_MODEL.md) · [Security architecture](docs/SECURITY_ARCHITECTURE.md) · [SECURITY.md](SECURITY.md)
- [Upstream analysis](docs/UPSTREAM_ANALYSIS.md) · [Upstream licensing](docs/UPSTREAM_LICENSING.md) · [ADRs](docs/ADR/)
- [Final report](FINAL_REPORT.md) · [Changelog](CHANGELOG.md)

## Known limitations

Worth knowing before you evaluate this for production:

- **Storage is SQLite-only today** — single-node, with brute-force vector
  search. A PostgreSQL adapter is on the roadmap, not shipped.
- **No built-in OIDC/MFA in the governance console.** Deploy it behind an
  identity-aware proxy if that's required for your environment.
- **The public website is not deployed anywhere.** It exists as source in
  this repository, unreleased.

The full, unfiltered list of known limitations is in
[FINAL_REPORT.md](FINAL_REPORT.md).

## Licensing and use rights

Evidentia is **not open source**. It is proprietary, source-available
software owned by Clixite SRL, Belgium. Anyone with access to this repository
may evaluate it and run non-production tests for up to 90 days. Production
use requires a written licence or service agreement with Clixite SRL. See
[LICENSE](LICENSE) for the exact terms.

Evidentia was inspired by
[GEOFlow](https://github.com/yaojingang/GEOFlow) by Yao Jingang
(AGPL-3.0-only). It is an independent, clean-room implementation that shares
no code with GEOFlow. See [docs/UPSTREAM_ANALYSIS.md](docs/UPSTREAM_ANALYSIS.md)
and [docs/UPSTREAM_LICENSING.md](docs/UPSTREAM_LICENSING.md).

Contributions: [CONTRIBUTING.md](CONTRIBUTING.md).
Security reports: [SECURITY.md](SECURITY.md) (security@clixite.eu).
