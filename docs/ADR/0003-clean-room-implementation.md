# ADR-0003 — Clean-room implementation; upstream used as inspiration only

**Status:** accepted · **Date:** 2026-09-18

## Context
GEOFlow (yaojingang/GEOFlow, AGPL-3.0-only, NOTICE with Apache-2.0 historical
portions and MIT DeepSeek Harness adaptations, CLA) is a Laravel/PHP platform with
Chinese-first artefacts. Evidentia is TypeScript, English-only, and sold commercially
to European organisations, possibly as a hosted service.

## Decision
- No source code, prompt text, template, asset, screenshot or documentation text is
  copied or mechanically translated from GEOFlow into this repository.
- GEOFlow is studied for architectural and operational ideas (documented in
  `docs/UPSTREAM_ANALYSIS.md`). Ideas are not subject to copyright; the report records
  a traceable feature matrix so the relationship is transparent.
- Evidentia's own licence is chosen by Clixite without AGPL obligations, because no
  AGPL code is distributed.
- Attribution: README, the website "Licence & attribution" page and
  `docs/UPSTREAM_LICENSING.md` state that Evidentia was inspired by GEOFlow, name the
  author and licence, and link the upstream repository. This is voluntary credit.

## Consequences
- Every file in this repository is original Clixite work or a declared third-party
  dependency listed in the SBOM / licence report.
- A licence scan of the dependency tree is part of the release gate.
- The final adversarial review checks the codebase for accidental upstream text.
