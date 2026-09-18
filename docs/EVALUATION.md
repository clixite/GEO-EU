# Evaluation

Evaluation is a first-class subsystem and a release gate.

## Layers

1. **Unit and integration tests** (`node:test`): every core module, the CLI
   runtime, the console (auth, CSRF, RBAC, flow), the skill scripts.
2. **Deterministic eval datasets** (`evals/datasets/*.json`, versioned):
   readiness fixtures, policy model-access and publication cases, grounding
   golden set, injection cases (positive and benign), robots cases, retrieval
   golden set, tenant isolation. Run with `evidentia evals run` (exit 8 on failure).
3. **End-to-end**: `scripts/smoke.ts` (18 CLI steps over the demo) and Playwright
   (console critical flow, security headers, forged cookie, CSRF; website
   structure, JSON-LD, sitemap/robots/llms.txt, keyboard, axe WCAG 2.2 AA,
   responsive overflow).
4. **Judged evaluations** (optional): content-quality rubric scores passed to
   the analyser (`quality` input), always labelled and separable; never the sole
   gate. Human-review criteria: originality vs consensus restatement, first-hand
   experience, claims supported, coverage of sub-questions.

## Datasets

| Dataset | Version | Cases | Purpose |
|---|---|---|---|
| readiness | 1.0.0 | 4 | well-built page ≥ 85, manipulative page ≤ 40, blocked page = 0, noindex page |
| governance | 1.0.0 | 21 | policy allow/deny, publication gate, robots per agent, injection, isolation |
| grounding | 1.0.0 | 6 | supported claims, fabricated figure, superlative, placeholder, invented award, wrong evidence |
| retrieval | 1.0.0 | 3 | authority weighting, lexical-only, near-duplicate disambiguation |

Add a case for every behavioural bug fixed; bump the dataset version when
expectations change deliberately and explain in the PR.

## Adversarial suites

Included in `governance` (injection) and `grounding` (fabrication). Extend with
organisation-specific phrasings; false positives are released by reviewers and
should become benign cases.

## Evidence retention

CI uploads `dist/evals-report.json`, the SBOM and Playwright reports as
artefacts; releases attach them (docs/RELEASE.md).

## Metrics to track over time

Unsupported-claim rate per model, placeholder rate, quarantine rate and false
positive rate, readiness score distribution per site section, observatory
mention/citation with intervals, cost per accepted draft.
