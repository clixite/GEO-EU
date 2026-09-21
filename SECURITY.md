# Security policy

Evidentia is built and maintained by Clixite SRL (Belgium). We treat security
reports as a priority and follow the Cyber Resilience Act vulnerability-handling
expectations (Regulation (EU) 2024/2847, Art. 14 reporting obligations
applicable since 11 September 2026).

## Reporting a vulnerability

- Email: **security@clixite.eu** (PGP key published at https://clixite.eu/.well-known/security.txt once available).
- Please include: affected component and version/commit, reproduction steps,
  impact, and whether the issue is being exploited.
- Do not open public issues for security problems.

## What to expect

| Step | Target |
|---|---|
| Acknowledgement | within 2 business days |
| Triage and severity (CVSS v4) | within 5 business days |
| Fix or mitigation for critical/high | as fast as possible; target ≤ 30 days |
| Coordinated disclosure | agreed with the reporter; default 90 days |
| Actively exploited vulnerability | early warning to ENISA single reporting platform within 24 h, notification within 72 h, final report within 14 days of a fix (CRA Art. 14) |

We credit reporters in release notes unless they prefer otherwise. We do not
pursue legal action against good-faith research that respects users' data and
availability.

## Supported versions

| Version | Supported |
|---|---|
| 1.x (current) | yes — security fixes |
| pre-release commits | no |

Support period: at least 24 months from the release of a major version, or
longer where contractually agreed.

## Security design in brief

- Deny-by-default model access per data class; policy-constrained fallback.
- SSRF-hardened outbound HTTP (private ranges, redirects, size and time caps, host pins).
- Prompt-injection scanning with quarantine of poisoned documents.
- Deterministic claim verification before any publication gate.
- Four-eyes approvals bound to content hashes; single consumption.
- Hash-chained append-only audit ledger.
- Secrets from the environment only; logger redaction of keys and prompt payloads.
- Console: signed HttpOnly SameSite=Strict sessions, CSRF double submit, strict CSP without scripts, RBAC, login rate limiting, body size limits.
- Supply chain: exact pins, lockfile, `pnpm audit`, licence allow-list, CycloneDX SBOM, gitleaks, CodeQL and Semgrep in CI.

Threat model: [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md). Architecture:
[docs/SECURITY_ARCHITECTURE.md](docs/SECURITY_ARCHITECTURE.md).

## Known limitations (documented residual risk)

- DNS rebinding between lookup and connect is mitigated, not eliminated; deploy
  behind an egress allowlist/proxy for hostile networks.
- No built-in MFA/SSO in the console; run it behind an identity-aware proxy.
- SQLite is single-node; multi-node deployments need the PostgreSQL adapter
  (roadmap).
- Text watermarking of AI-generated prose is provider-side; Evidentia signs
  pages and records the model but cannot watermark tokens.
