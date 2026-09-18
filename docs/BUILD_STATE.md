# Build state — Evidentia (GEO-EU)

Durable working state for long-horizon work. Updated 2026-09-18 (evening).

## Identity
- Product: **Evidentia** — governed generative visibility for European organisations.
- Owner: Clixite SRL (Belgium). Repo: github.com/clixite/GEO-EU (private). Branch: `feat/evidentia-v1`.
- Upstream studied: yaojingang/GEOFlow @ `9ed2fe80457d5eb280a4bca7cf799895bf2ca3b1` (3.2.0-beta.1; stable v3.1.0; AGPL-3.0-only). Clean-room (ADR-0003).

## Capability matrix (environment, verified 2026-09-18)
Node 24.12 (native TS, node:sqlite/FTS5, node:test) · pnpm 10.26 · Docker 29 · gh 2.83 + GitHub MCP (clixite) · Playwright 1.63 + Chromium · gitleaks 8.30 · Python 3.14 (not used at runtime) · no PHP (upstream analysed statically) · semgrep/trivy/syft/lighthouse not installed locally (CI equivalents configured).

## Phases
| # | Phase | Status | Evidence |
|---|---|---|---|
| 0–1 | Repo, branch, environment discovery | done | this file; probe tests |
| 2 | Upstream forensic analysis | done | docs/UPSTREAM_ANALYSIS.md (494 lines), docs/UPSTREAM_LICENSING.md |
| 3 | GEO/AEO state of the art | done | docs/GEO_METHODOLOGY.md (31 techniques, 90 sources) |
| 4 | EU governance primary sources | done | docs/EU_GOVERNANCE.md, governance/sources.yaml (68 sources) |
| 5 | Agent Skills conventions | done | skill/evidentia (open spec layout; Claude-only fields avoided) |
| 6 | Identity + ADRs | done | ADR-0001..0005 |
| 7 | Core engine | done | packages/core — 81 node:test cases passing |
| 8 | Governance control plane | done | policy engine, registers, approvals, provenance, retention, ledger |
| 9 | CLI | done | packages/cli; 18-step smoke passes |
| 10 | Agent Skill | done | SKILL.md + 10 references + 7 scripts; 6 script tests passing; install/verify/uninstall round trip |
| 11 | Admin console | done | apps/admin; 5 tests passing; e2e critical flow passes on desktop |
| 12 | Website | done (build ok, 25 pages) | website/dist; e2e: structure/JSON-LD/sitemap/keyboard/responsive pass; contrast fixes applied |
| 13 | Security: threat model, scans, SBOM | done | docs/THREAT_MODEL.md, SECURITY_ARCHITECTURE.md, SECURITY.md; gitleaks clean (fixture allowlist); pnpm audit clean; SBOM 316 components; licence gate ok (platform-optional binaries reported as not-installed) |
| 14 | Tests: unit/integration/e2e | done / final e2e pass in progress | see Verification log |
| 15 | Adversarial review + fixes | in progress (independent agent writing docs/reviews/ADVERSARIAL_REVIEW.md) | |
| 16 | Release, FINAL_REPORT.md, PR | pending | |

## Decisions
ADR-0001 identity · ADR-0002 stack · ADR-0003 clean room · ADR-0004 native Node + SQLite · ADR-0005 deterministic verification before judgement.

## Blockers
- None. Lighthouse not run locally (tool not installed); Playwright + axe cover accessibility/structure; performance budget documented, not measured with Lighthouse in this session.

## Verification log (2026-09-18)
- `pnpm test` (core): 81 pass · admin: 5 pass · skill scripts: 6 pass.
- `node scripts/smoke.ts`: 18 steps pass (ingest+quarantine, search, analyse ≥85, grounded draft 0 unsupported, gate→approval, four-eyes refusal, publish with manifest, double publish refused, observatory 28 obs with Wilson, policy denial of unapproved model, DSAR, audit verify, evals 4/4 datasets, export).
- `evidentia evals run`: readiness 4/4, governance 21/21, grounding 6/6, retrieval 3/3.
- `pnpm build` (website): 25 pages.
- `pnpm test:e2e`: 13/18 → remaining failures being fixed (contrast, mobile viewport) — see FINAL_REPORT for final numbers.
- `gitleaks detect`: no leaks. `pnpm audit --audit-level=high`: none. `node scripts/licenses.ts`: ok. `node scripts/sbom.ts`: dist/sbom.cdx.json.
