# Changelog

All notable changes to Evidentia. Format: Keep a Changelog; versioning: SemVer.

## [1.0.0] — 2026-09-18

Initial release. Built and maintained by Clixite SRL — Belgium.

### Added
- **Core engine** (`@evidentia/core`): SQLite store with append-only migrations;
  hash-chained audit ledger; redacting structured logger; policy engine (YAML,
  deny-by-default model access per data class, publication gate); model
  registry, AI system register, processing records; four-eyes approvals bound to
  content hashes; Ed25519 provenance manifests with IPTC/JSON-LD marking;
  retention, tenant export and erasure; SSRF-hardened `safeFetch`; provider
  adapters (Anthropic, OpenAI-compatible, Google), local hashed embeddings, demo
  provider; policy-aware router with cost meter and budgets; HTML/Markdown
  extraction, chunking, claim and entity extraction, knowledge store with
  prompt-injection quarantine and DSAR tooling; hybrid retrieval with citations;
  per-agent robots evaluation; `readiness-v1` GEO analyser; grounded prompting
  and deterministic verification; Markdown renderer; publishing pipeline and
  adapters (static, WordPress, signed HTTP); AI visibility observatory with
  Wilson intervals; deterministic evals runner.
- **CLI** (`@evidentia/cli`): `evidentia` with JSON output and exit codes.
- **Governance console** (`@evidentia/admin`): server-rendered, CSP without
  scripts, signed sessions, CSRF, RBAC, login rate limiting.
- **Agent Skill** (`skill/evidentia`): SKILL.md control plane, ten references,
  cross-platform scripts, evals and templates.
- **Website** (`website`): Astro static site, GEO-optimised (JSON-LD, canonical,
  sitemap, robots, llms.txt with status note), no client scripts.
- **Demo**: fictional Northwind Bank SA dataset; 18-step offline smoke flow.
- **Governance corpus**: `governance/policies/eu-default.yaml`,
  `governance/sources.yaml` (68 primary sources).
- **Docs**: architecture, product, installation, operations, release, GEO
  methodology, evaluation, EU governance, AI Act, GDPR, model and data
  governance, threat model, security architecture, upstream analysis and
  licensing, ADRs 0001–0003, final report.
- **CI**: typecheck, tests, evals, smoke, build, Playwright, `pnpm audit`,
  licence gate, CycloneDX SBOM, gitleaks, CodeQL, Semgrep.

### Known limitations
See FINAL_REPORT.md § Remaining limitations.
