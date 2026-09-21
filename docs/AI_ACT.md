# EU AI Act — implementation notes

Legal analysis with dated primary sources: docs/EU_GOVERNANCE.md §A;
register: governance/sources.yaml. Engineering positions, not legal advice.

## Roles and classification

| Question | Position | Evidence in product |
|---|---|---|
| Is Evidentia an AI system? | Yes — generative drafting from models is placed on the market under Clixite's name | AI system register entry (demo/ai-system.json as template) |
| Provider / deployer | Clixite = provider; customer = deployer | AI system record `deploymentRole` |
| High-risk (Annex III)? | No after screening; electoral use prohibited by AUP | `riskClassification`, `riskReasoning`, `prohibitedUses` |
| GPAI obligations | Not applicable (no model training) | — |
| Prohibited practices (Art. 5) | Screened out; no manipulation, biometric or social-scoring functions | policy + register |

## Article 50 controls

| Obligation | Implementation |
|---|---|
| 50(2) machine-readable marking of synthetic content | `createManifest` + `signManifest` (Ed25519) bound to content hash; IPTC `digitalSourceType` meta and JSON-LD; `markingArtifacts` |
| 50(4) disclosure of AI-generated public-interest text | visible "AI transparency notice" rendered when `requiresDisclosure`; policy default on for AI-assisted |
| Human review exception (editorial control) | deterministic verification, four-eyes approval bound to body hash, post-approval lock, named `editorialResponsibility` in the manifest |
| Detection route | published public key verifies manifests (`verifyManifest`); content hash proves integrity |
| Dates | Art. 50 applicable since 2 Aug 2026 (grace to 2 Dec 2026 for systems on the market before); CoP interoperability signpost 2 Feb 2027 |

## Article 4 AI literacy

Deployers must ensure staff literacy. Record briefings as `evidence` on the AI
system record; the console flags overdue reviews. Suggested curriculum: how
grounded drafting works, why verification blocks, what a disclosure means,
how to read observatory intervals.

## Records and logging

Not a high-risk system, so Art. 12 logging is not mandatory — Evidentia logs
anyway: ledger events with policy, model, approval, request ids; model-call
metering; observatory records. Export for audits: `evidentia audit list --json`,
`evidentia export`.

## Risk management

Policy engine (deny-by-default), injection quarantine, deterministic gate,
evals as release gates, threat model, incident process. Review cadence:
AI system `reviewDate` ≤ 12 months.

## Content transparency in practice

Marketing copy that carries health, safety, sustainability or investor claims is
in Art. 50(4) scope: pass `--topics health` etc. so the gate requires a human,
and keep the disclosure on.

## Claims Evidentia does not make

"AI Act compliant", "certified", "approved by the AI Office". Instead: controls,
evidence, dates, and items requiring legal assessment.
