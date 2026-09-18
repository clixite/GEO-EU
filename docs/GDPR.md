# GDPR — privacy engineering notes

Legal analysis with sources: docs/EU_GOVERNANCE.md §B, §F, §I. Not legal advice.

## Roles

| Deployment | Clixite | Customer | Model providers |
|---|---|---|---|
| Self-hosted | software vendor | controller | (sub-)processors contracted by the customer |
| Clixite-operated | processor (Art. 28 DPA) | controller | sub-processors listed in the DPA |

## Privacy by design in the product

| Principle | Mechanism |
|---|---|
| Purpose limitation | processing records per purpose (`evidentia processing register`) |
| Legal basis | recorded per purpose; LIA reference for legitimate interests |
| Minimisation | first-party sources; no prompt/answer logging; observatory stores hashes; data classes gate model access |
| Access control | tenant scoping; console roles; four-eyes |
| Rights | `dsar find`, `dsar redact` (rectification/erasure across derived artefacts), `export` (access/portability), `erase tenant` |
| Retention | policy `retentionDays`; `retention apply`; `secure_delete` SQLite |
| Security | see SECURITY_ARCHITECTURE.md |
| Transfers | model registry `hosting`, `processingRegion`, `subprocessors`; policy restricts personal data to EU/EEA or self-hosted zero-retention models |
| Accountability | ledger, registers, this documentation |

## DPIA template (outline)

1. Description: purposes (GEO analysis, drafting, measurement), data flows
   (sources → store → models → publications), data categories and subjects.
2. Necessity and proportionality: first-party corpus; minimisation measures;
   retention.
3. Risks: re-identification through drafts; provider misuse; injection leading
   to disclosure; loss of ledger.
4. Measures: policy engine, quarantine, verification, disclosure, ledger,
   encryption at rest, DSAR tooling, provider DPAs, TIA for non-EU providers.
5. Consultation: DPO sign-off; review annually or on material change.

## Records of processing (Art. 30)

`ProcessingRecord` schema: purpose, legal basis, LIA reference, role, categories,
subjects, recipients, processors (name, role, DPA, location), transfers
(destination, mechanism, reference), retention, security measures, DPIA
reference, residency. Example: demo/processing-record.json.

## Data subject requests — runbook

1. Identify: `evidentia dsar find "<name>"` (chunks, claims, aliases).
2. Access: export the matching passages; `evidentia export` for full portability.
3. Rectify/erase: `evidentia dsar redact "<name>" --replacement "[redacted]" --reason "DSAR-…"`.
4. Confirm within 30 days; the ledger holds a hashed record of the operation.

## Web scraping and third-party content

Third-party pages are fetched only on explicit request, honour robots.txt, are
labelled `third-party`/`unverified`, and carry lower retrieval authority. EDPB
Guidelines 03/2026 (draft) place first-party content outside their scope.

## ePrivacy

No client-side beacons, cookies or trackers in the console, the website or
published pages. Belgian DPA: visitor counting is not strictly necessary — use
server-side, cookie-free counting.
