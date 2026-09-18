# Evaluation (reference for evaluation mode)

Evaluation is a first-class subsystem and a release gate. Two layers:

## 1. Deterministic datasets (`evals/datasets/*.json`)

Run: `evidentia evals run [--dataset file] [--out report.json]` (exit 8 on failure).

| Kind | What it checks |
|---|---|
| readiness | expected check statuses / score ranges for fixture pages |
| policy-model-access | model record × data classes → allow/deny (+ matched rule) |
| policy-publication | facts → allow / require_approval / deny, disclosure flag |
| grounding | draft + evidence → unsupported count, coverage, placeholders |
| injection | text → high-severity finding ids |
| robots | robots.txt + path → per-agent allow/deny |
| retrieval | mini corpus + query → expected top locator |
| isolation | tenant A content invisible to tenant B (search, listing, DSAR) |

Datasets are versioned (`id`, `version`); add cases when a bug is fixed
(regression) or a heuristic changes (golden update, documented in the PR).

## 2. Unit and integration tests

`pnpm test` runs node:test suites for every core module (ledger integrity,
policy, approvals, router fallback, SSRF, extraction, retrieval, analyser,
grounding, provenance, pipeline, observatory, adapters), the CLI runtime, the
admin console (auth, CSRF, RBAC, flow) and the skill scripts
(`node --test skill/evidentia/evals/`). `node scripts/smoke.ts` runs the whole
offline demo flow through the CLI.

## 3. Judged evaluations (optional, labelled)

Content quality can be judged by a human or a model rubric and passed to the
analyser (`quality` input, 15 points). It is never the sole gate and is always
shown separately from the deterministic score. Never rely on one LLM judging
another as the only evidence.

## Adversarial checks the agent can run

- Poisoned document: ingest text with "ignore previous instructions" →
  expect exit 5 and absence from `search`.
- Fabricated figure: create a draft citing `[E1]` with a wrong number → `draft
  verify` exit 6, gate `blocked`.
- Wrong-model routing: `scripts/policy-precheck.mjs --provider openai --model
  gpt-example --classes confidential` → DENY.
- Tamper: modify a row in `audit_events` on a scratch copy → `audit verify`
  exit 7.

## Reporting

State dataset ids, versions, pass/fail counts and the exact commands. Attach
`--out` JSON when the user needs evidence for a release.
