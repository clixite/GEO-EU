# Evidentia

**Governed generative visibility for European organisations.**
Built and maintained by **Clixite SRL — Belgium**.

Evidentia makes authoritative organisations easier for humans and AI systems to
discover, understand, verify, cite and trust — with governance built in. It is a
self-hosted platform (core engine + CLI + governance console), a public website,
and a Claude Code Agent Skill.

```
TRUSTED KNOWLEDGE → STRUCTURED UNDERSTANDING → EVIDENCE-GROUNDED CONTENT → GOVERNANCE GATES
→ HUMAN ACCOUNTABILITY → DISTRIBUTION → AI DISCOVERABILITY → MEASUREMENT → CONTINUOUS IMPROVEMENT
```

## What it does

| Capability | In one line |
|---|---|
| Trusted knowledge | Sources with owners and authority levels; content-addressed documents; claims and entities; prompt-injection quarantine; DSAR find/redact |
| Retrieval | BM25 + embeddings fused by reciprocal rank fusion, authority/freshness signals, citations with character offsets |
| GEO readiness | `readiness-v1`: evidence-tiered checks, per-AI-agent robots evaluation, penalties, informational (D/E) items at zero weight |
| Grounded drafting | Numbered evidence, mandatory markers, placeholders instead of invention; deterministic verification of figures and qualifiers |
| Governance | YAML policies (deny-by-default model access per data class; publication gate), model registry with data-policy metadata, AI system register, processing records |
| Human accountability | Four-eyes approvals bound to the content hash; hash-chained audit ledger |
| Publishing | Static export, WordPress REST, signed HTTP; visible AI disclosure; Ed25519-signed provenance manifests (AI Act Art. 50 route) |
| AI visibility | Versioned query sets, repeated sampling through official APIs, Wilson intervals, series breaks |
| Cost | Metered calls, budgets (soft alert / hard block), policy-constrained routing strategies |
| Evaluation | Deterministic datasets (readiness, policy, grounding, injection, robots, retrieval, isolation) as release gates |

## Quick start (offline, no API keys)

Requirements: Node.js ≥ 24, pnpm ≥ 10.

```bash
pnpm install --frozen-lockfile
node packages/cli/bin/evidentia.mjs init --db ./.evidentia/demo.db --tenant demo
node packages/cli/bin/evidentia.mjs demo load --db ./.evidentia/demo.db --tenant demo
node packages/cli/bin/evidentia.mjs search "how long are support recordings kept" --db ./.evidentia/demo.db --tenant demo
```

Full walkthrough: [docs/INSTALLATION.md](docs/INSTALLATION.md) · demo details: [demo/README.md](demo/README.md).

## Repository layout

```
packages/core     domain engine (TypeScript, Node 24, node:sqlite; deps: zod, yaml)
packages/cli      `evidentia` CLI
apps/admin        governance console (Hono, server-rendered)
website           public site (Astro, static)
skill/evidentia   Claude Code Agent Skill (open Agent Skills layout)
governance/       policies/*.yaml · sources.yaml (68 primary EU sources)
evals/datasets    deterministic evaluation datasets
demo/             fictional Northwind Bank SA dataset
tests/e2e         Playwright browser tests (console + website)
scripts/          smoke flow, SBOM (CycloneDX), licence gate
docs/             architecture, methodology, governance, threat model, ADRs …
```

## Verify

```bash
pnpm typecheck && pnpm test              # unit/integration (core, CLI, console)
node --test "skill/evidentia/evals/*.test.mjs"
node scripts/smoke.ts                    # 18-step offline end-to-end flow
node packages/cli/bin/evidentia.mjs evals run --db :memory:
pnpm build && pnpm test:e2e              # website build + Playwright
node scripts/licenses.ts && node scripts/sbom.ts
```

## Documentation

- [Product](docs/PRODUCT.md) · [Architecture](docs/ARCHITECTURE.md) · [Installation](docs/INSTALLATION.md) · [Operations](docs/OPERATIONS.md) · [Release](docs/RELEASE.md)
- [GEO methodology](docs/GEO_METHODOLOGY.md) · [Evaluation](docs/EVALUATION.md)
- [EU governance](docs/EU_GOVERNANCE.md) · [AI Act](docs/AI_ACT.md) · [GDPR](docs/GDPR.md) · [Model governance](docs/MODEL_GOVERNANCE.md) · [Data governance](docs/DATA_GOVERNANCE.md)
- [Threat model](docs/THREAT_MODEL.md) · [Security architecture](docs/SECURITY_ARCHITECTURE.md) · [SECURITY.md](SECURITY.md)
- [Upstream analysis](docs/UPSTREAM_ANALYSIS.md) · [Upstream licensing](docs/UPSTREAM_LICENSING.md) · [ADRs](docs/ADR/)
- [Final report](FINAL_REPORT.md) · [Changelog](CHANGELOG.md)

## Licence and attribution

Evidentia is proprietary software of Clixite SRL (see [LICENSE](LICENSE)).
It was inspired by [GEOFlow](https://github.com/yaojingang/GEOFlow) by Yao
Jingang (AGPL-3.0-only); Evidentia is an independent clean-room implementation
and shares no code with GEOFlow. See [docs/UPSTREAM_LICENSING.md](docs/UPSTREAM_LICENSING.md).

Security reports: [SECURITY.md](SECURITY.md). Contributions: [CONTRIBUTING.md](CONTRIBUTING.md).
