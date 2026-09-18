# Upstream licensing and intellectual-property analysis

Date: 2026-09-18. Upstream: yaojingang/GEOFlow @ `9ed2fe80457d5eb280a4bca7cf799895bf2ca3b1`
(source 3.2.0-beta.1; latest stable v3.1.0). Facts below come from the upstream
`LICENSE`, `NOTICE`, `CLA.md`, `docs/licenses/*` and file headers (see
docs/UPSTREAM_ANALYSIS.md §1 and §18).

## Upstream licence facts

- Licence: **GNU Affero General Public License v3.0 only** since v3.0.0
  (2026-09-05). AGPL's section 13 extends copyleft to network use: anyone who
  runs a modified version as a network service must offer the corresponding
  source to users.
- `NOTICE`: copyright Yao Jingang; alternative commercial terms available from
  the copyright holder; historical releases before the licence change remain
  under their original terms (Apache-2.0 for tags ≤ v2.3.0); Apache-2.0 text
  retained at `docs/licenses/Apache-2.0.txt`.
- MIT-licensed adaptations: AI Workspace run-status projection, task motion,
  event timeline, model readiness and Agent Turn patterns adapted from DeepSeek
  Harness (DeepSeek) and DeepSeek Harness Desktop 2.0.2 (Anywhere Labs).
- `CLA.md`: contributor licence agreement enabling the author to relicense.
- 44 files carry "All rights reserved" headers (25 themes, 16 skill files) that
  contradict the repository licence — a reason not to reuse them.

## Decision (ADR-0003): clean-room implementation

Evidentia contains **no** GEOFlow source code, prompts, regex tables, database
schemas, templates, themes, screenshots, documentation text or skill prose. The
upstream was inspected to understand its architecture and operational ideas
(feature matrix in docs/UPSTREAM_ANALYSIS.md §17), which are not protected by
copyright. Consequently:

| Category | Content | Licence status |
|---|---|---|
| 1. Original Clixite implementation | `packages/*`, `apps/*`, `website`, `skill/*`, `governance/*`, `evals/*`, `demo/*`, `docs/*`, `scripts/*`, `tests/*` | Clixite SRL proprietary (LICENSE) |
| 2. Adapted upstream code | none | — |
| 3. Unchanged upstream components | none | — |
| 4. External dependencies | see below | each dependency's own licence |
| 5. Externally sourced assets | none (all diagrams and icons are original SVG) | — |

Because no AGPL code is distributed or run, AGPL obligations (source
availability, licence propagation, NOTICE preservation) do not attach to
Evidentia. Attribution to GEOFlow is given voluntarily in README, the website
Licence page and this document.

## Runtime and build dependencies (from the lockfile; enforced by `scripts/licenses.ts`)

| Package | Role | Licence |
|---|---|---|
| zod | schema validation (core) | MIT |
| yaml | policy parsing (core, scripts) | ISC |
| hono, @hono/node-server | governance console | MIT |
| astro (and its build-time dependency tree) | website build | MIT (tree: MIT/ISC/BSD/Apache-2.0 per SBOM) |
| typescript | type checking | Apache-2.0 |
| @playwright/test, @axe-core/playwright | browser and accessibility tests | Apache-2.0, MPL-2.0 |
| @types/node | types | MIT |

The CycloneDX SBOM (`node scripts/sbom.ts`) lists every transitive package with
its licence and integrity hash; the licence gate fails the build on any package
outside the allow-list (MIT, ISC, BSD-2/3, Apache-2.0, 0BSD, CC0-1.0, Unlicense,
BlueOak-1.0.0, Python-2.0, MPL-2.0, CC-BY-4.0, MIT-0).

## Verification performed

- Upstream clone inspected read-only in a scratch directory; nothing copied.
- Repository grep for upstream identifiers (`GeoFlow`, `geo_admin`, `yao-geoflow`,
  Chinese-script text) in product code and docs returns only attribution and
  analysis references (docs/UPSTREAM_ANALYSIS.md, this file, README, website
  licence page).
- Licence gate and SBOM run in CI on every push.

## Standards and data sources

Schema.org, IPTC DigitalSourceType vocabulary, RFC 9309 (robots), CycloneDX 1.5
are open specifications. Legal texts cited in governance documentation are
official EU/Belgian publications listed in `governance/sources.yaml`.
