# EU AI Act (reference for governance mode)

Primary-source analysis with dates and citations: docs/EU_GOVERNANCE.md §A;
source register: governance/sources.yaml. Verdicts below are engineering
positions, not legal advice; say so when asked.

## Applicability (Regulation (EU) 2024/1689 as amended by 2026/1744)

- **Clixite = provider** of a generative AI system (Evidentia drafting) placed
  on the market under its name; **the customer = deployer**.
- **Not high-risk** after Annex III screening (no biometrics, critical
  infrastructure, education, employment, essential services, law enforcement,
  migration, justice/democratic processes). Keep electoral content in
  `prohibitedUses`. High-risk rules were deferred to 2 Dec 2027 by the Digital
  Omnibus; irrelevant unless the system is repurposed.
- **Article 50 applies** (since 2 Aug 2026; grace to 2 Dec 2026 only for systems
  already on the market before 2 Aug 2026): 50(2) provider-side machine-readable
  marking of synthetic content; 50(4) deployer disclosure for AI-generated text
  published to inform the public on matters of public interest, with an
  exception where the text underwent human review with editorial responsibility.
- **Article 4 AI literacy** (since 2 Feb 2025): deployers must ensure staff
  literacy; record briefings as evidence on the AI system record.
- GPAI-model obligations (Art. 53) do not apply to Evidentia (no model training).
- Art. 12 logging is a high-risk duty; Evidentia logs anyway (ledger).

## What Evidentia implements

| Obligation | Control | Where |
|---|---|---|
| Inventory / accountability | AI system register: role, risk reasoning, oversight, approved/prohibited uses, review date, evidence | `evidentia system register|list`, console → AI system register |
| Art. 50(2) marking | Signed Ed25519 manifest (content hash, models, editorial responsibility), IPTC `digitalSourceType`, meta tags, JSON-LD | `draft publish` artefacts, `governance/provenance.ts` |
| Art. 50(4) disclosure | Visible "AI transparency notice" on AI-assisted pages | publication gate `requiresDisclosure` |
| Human review exception | Four-eyes approval bound to content hash, named editor/role, post-approval lock | pipeline |
| Provider/model records | Model registry with hosting, retention, training use, DPA, subprocessors | `evidentia model` |
| Risk management | Policy engine, quarantine, verification gate, evals | `governance/policies`, `evals/` |
| Records / logs | Hash-chained ledger with policy id, model id, approval id | `evidentia audit` |

## Limits to state honestly

- Text watermarking is provider-side; Evidentia records the model and signs the
  page but cannot watermark tokens itself.
- No standard is mandated (C2PA is not named by the Act or the Code of Practice);
  Evidentia's manifest is standard-neutral and interoperable via JSON-LD/meta.
- "EU compliant" is never a claim; describe controls and evidence, and refer
  customers to counsel for `requires-legal-assessment` items (e.g. copyright in
  AI-assisted outputs, own CRA/NIS2 status).

## Register template

`assets/ai-system.template.json` → fill → `evidentia system register --file …`.
Set `reviewDate` ≤ 12 months ahead; the console flags overdue reviews.
