# Security architecture

## Principles

Least privilege · explicit trust boundaries · deny-by-default networking and
model access · secrets outside the codebase and database · deterministic
controls before probabilistic ones · everything consequential is audited.

## Identity and access

- **CLI:** the operating-system user; `--actor` / `EVIDENTIA_ACTOR` names the
  person in the ledger. Multi-user deployments use the console or per-user
  environments.
- **Console:** named users with hashed personal tokens and roles
  (viewer < editor < approver < admin). Sessions are HMAC-SHA256-signed cookies
  (HttpOnly, SameSite=Strict, Secure on https, 8 h). CSRF token per session,
  double submit. Login rate limited. Roadmap: OIDC (SSO/MFA) — until then use an
  identity-aware reverse proxy.
- **Four-eyes:** enforced in `ApprovalService.decide` (requester ≠ decider) and
  in role checks (editors cannot approve).

## Data protection

- SQLite with `secure_delete`, WAL; one file per deployment (recommended: one
  per tenant). Encrypt the volume at rest (LUKS/BitLocker/cloud KMS).
- Tenant id on every table and every query; export and erasure per tenant.
- Personal-data tooling: `dsar find`, `dsar redact` (rewrites documents, chunks,
  FTS, claims, entities; ledger keeps a hash of the term), retention purges.
- Prompts/answers: never logged; ledger keeps prompt hash; observatory keeps
  answer hash.

## Model and network egress

- `PolicyAwareRouter` evaluates `governance/policies/*.yaml` per request data
  class against the model's registry record (hosting, training use, DPA, zero
  retention). No candidate → `policy_denied`, audited. Fallback only among
  allowed candidates. Hard budgets block.
- `safeFetch` for every outbound request: https (http only if explicitly
  enabled), credentials in URLs rejected, local/`.internal` hosts rejected,
  literal-IP and DNS resolution checked against private/loopback/link-local/
  CGNAT/multicast/IPv4-mapped/NAT64/6to4 ranges, manual redirects re-validated
  (max 3), 15 s timeout, 5 MB default cap, Evidentia user agent. Adapters pin the
  vendor host.

## Input handling

- HTML extraction is a bounded, non-executing tokenizer (8 MB cap); JSON-LD is
  parsed, never evaluated.
- Prompt-injection scanner on ingest (quarantine) and in the readiness analyser.
- Markdown → HTML renderer escapes everything and allows only http(s)/mailto
  links; no raw HTML passthrough.
- Console bodies ≤ 512 KB; slugs restricted to `[a-z0-9-]`.

## Integrity and provenance

- Audit ledger: sha256 over canonical JSON of each event + previous hash;
  `verify()` recomputes the chain; used as a release gate.
- Approvals bound to `sha256(body)` and consumed once.
- Provenance manifests signed with Ed25519 (`node:crypto`), verifiable with the
  published public key; content hash binds manifest to text.
- Skill package integrity: manifest of files + sha256 comparison.

## Secrets

- Provider keys: `EVIDENTIA_PROVIDER_<NAME>_API_KEY`; publishing:
  `EVIDENTIA_PUBLISH_*`; console: `EVIDENTIA_ADMIN_SECRET`, `EVIDENTIA_ADMIN_USERS`
  (hashes). `.env.example` lists names only. `gitleaks` in CI and pre-release.
- Signing key file created with mode 0600; rotate by generating a new key and
  keeping the old public key published.

## Supply chain

- Exact version pins, `pnpm-lock.yaml`, `engine-strict`.
- Core runtime dependencies: `zod`, `yaml`. Admin adds `hono`,
  `@hono/node-server`. Website adds `astro` (build-time only).
- CI: `pnpm audit --audit-level=high`, licence allow-list (`scripts/licenses.ts`),
  CycloneDX 1.5 SBOM (`scripts/sbom.ts`), gitleaks, CodeQL, Semgrep.
- Releases: tagged, SBOM and checksums attached (docs/RELEASE.md).

## Logging and monitoring

- Structured JSON logs with correlation/request/job ids; redaction built in.
- `evidentia audit verify` and `evidentia status` are designed for scheduled
  monitoring (non-zero exit on breakage).
- Recommended: ship logs to your SIEM; alert on `model.call_denied`,
  `auth.login_failed`, `document.quarantine`, ledger verification failures.

## Deployment recommendations

- Bind the console to localhost; terminate TLS and identity at a reverse proxy.
- Egress allowlist limited to registered provider hosts and publishing targets.
- Read-only filesystem for the application; writable volume for
  `.evidentia/` only.
- Back up the SQLite file and signing key; test restores; export the ledger
  head hash to an external, append-only location weekly.
