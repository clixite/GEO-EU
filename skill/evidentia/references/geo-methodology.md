# GEO methodology (reference for geo-optimisation, strategy, structured-data and observatory modes)

Full evidence brief with sources: docs/GEO_METHODOLOGY.md. Use the tiers below in
every recommendation; do not present tier D/E items as facts.

Tiers: **A-conditional** experimentally supported *only in-context* (Aggarwal
et al. 2024; not replicated as a retrieval booster) · **B** official engine
guidance · **C** observational (large-N correlational) · **D** hypothesis ·
**E** folklore/contradicted.

## What actually matters (in order)

1. **Retrievability (B, deterministic).** If OAI-SearchBot, Claude-SearchBot,
   PerplexityBot, Googlebot or bingbot cannot fetch the page, nothing else
   counts. Training crawlers (GPTBot, ClaudeBot, CCBot, Google-Extended) can be
   blocked without affecting answers. Check noindex / nosnippet /
   max-snippet:0 / noarchive (Copilot), canonical, server-rendered main content.
2. **Extractable evidence (A-conditional/C).** Sourced statistics with dates and
   links, attributed quotations, comparison tables and procedural lists where
   the intent warrants, the entity named in the first sentence, a short direct
   answer before the first H2. No fixed word counts.
3. **Provenance & freshness (B/C).** Visible date + `datePublished`/`dateModified`
   in ISO 8601, byline and author page, Organization JSON-LD with ≥2 `sameAs`.
   Scored as hygiene — the controlled Ahrefs study found *no* citation lift from
   schema; substantive updates correlate with citation (Ahrefs 17M URLs, Seer).
4. **Structure (B).** One H1, no skipped levels, `<main>`/`<nav>` landmarks,
   alt text, correct hreflang (self + x-default, absolute).
5. **Hygiene (negative).** Keyword stuffing, hidden text, instruction-like text
   aimed at AI systems, thin pages, markup that does not match visible text.
6. **Off-site context (C, not in the page score).** Branded mentions, YouTube,
   Wikipedia/Wikidata presence out-correlate backlinks. Real work, no shortcuts.

## Folklore to refuse (E)

40–60-word "answer blocks"; FAQPage schema as a citation lever (rich result
removed 2026-05); "schema gives 2.5–3× citations"; llms.txt as a ranking factor
(engines ignore it; harmless to publish); "+40% from author bios"; chunking
pages for AI; separate content for AI; fixed refresh cadences; blocking
Google-Extended to leave AI Overviews.

## readiness-v1 score

Retrievability 30 · Evidence 25 · Provenance 20 · Structure 10 · Content
quality (judged, optional) 15 · Hygiene penalties up to −15 · Off-site 0
(reported separately). Weights are a documented product choice, versioned in
`packages/core/src/geo/analyzer.ts`; the report exposes a deterministic-only
score and every check with its tier, evidence and points at stake. A hard block
on all search agents zeroes the score.

## Structured data — what to say

Recommend Organization (name, url, logo, sameAs) and Article/WebPage
(author, datePublished, dateModified) for entity and date understanding.
Markup must match visible content. Never promise citation gains from JSON-LD.

## Measuring visibility (observatory)

Generative answers are stochastic: resampling explains ~35% of variance, query
language ~27%. Protocol: 7–8 repeats × 3–5 paraphrases × engine × language ×
date; report rates with Wilson intervals; mark series breaks on model-version
change; branded and unbranded prompts separately; official APIs only (consumer
UIs are off-limits under every provider's terms; Gemini API terms restrict
link-level monitoring — store aggregates). `evidentia observe run --samples 8`.

## Advice pattern

1. Run `scripts/analyze-url.mjs`. 2. Fix blockers (retrievability) first.
3. Then evidence and provenance. 4. Report tier per recommendation. 5. Measure
before/after with the observatory over weeks, never from one answer.
