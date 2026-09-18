# ADR-0005 — Deterministic verification and gates before any model judgement

**Status:** accepted · **Date:** 2026-09-18

## Context
Upstream and market tools rely on an LLM "quality reviewer" to score drafts.
A model judging a model is expensive, non-reproducible and manipulable by the
content it judges (prompt injection).

## Decision
- Claim verification is deterministic: content-word overlap, exact figure
  presence, literal qualifier presence, per cited passage.
- The publication gate consumes only deterministic facts (unsupported count,
  placeholders, coverage, topics, source kinds, AI-assisted flag, readiness).
- Judged quality (human or model rubric) is optional, labelled and separable in
  the readiness score (15/100); it never gates alone.
- Prompt-injection detection is a deterministic scanner feeding quarantine.

## Consequences
- Some legitimate paraphrases fail verification (tunable thresholds; the
  reviewer can adjust the draft); fabricated numbers cannot pass.
- Evals are reproducible in CI without provider access.
