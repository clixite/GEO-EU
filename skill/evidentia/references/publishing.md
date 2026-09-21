# Publishing (reference for publishing mode)

## Preconditions

Draft status must be `approved` (gate `allow`, or `require_approval` decided by
a second person). `evidentia draft show <id>` prints status, gate reasons and
approval id.

## Command

`evidentia draft publish <id> --target <target> --editor "<name>" --role "<role>" --actor <who>`

Targets:
- `static:<dir>` — writes `<slug>.html`, `<slug>.md`, `<slug>.manifest.json`
  (for static sites, CI pipelines, CMS import).
- `wordpress:<baseUrl>` — WordPress REST `wp/v2/posts` with an application
  password from `EVIDENTIA_PUBLISH_WORDPRESS` (`user:app-password`); host pinned.
- `http:<url>` — JSON POST signed with HMAC-SHA256 from
  `EVIDENTIA_PUBLISH_HTTP_SECRET` (`x-evidentia-signature`, `x-evidentia-timestamp`);
  the receiver verifies with `verifyGenericSignature`.

## What is published

- HTML: `<main><article>` with the rendered Markdown, `[E#]` markers converted to
  footnotes and a Sources section, the visible AI transparency notice when
  required, meta tags (`ai-disclosure`, IPTC `digitalSourceType`, content hash,
  signature) and a CreativeWork JSON-LD block.
- Markdown with sources.
- Signed manifest (Ed25519): content hash, generation time, AI-assisted flag,
  models, evidence sources, editorial responsibility (name, role, approval id),
  publisher, disclosure text. Verify with `verifyManifest` and the public key.

## After publishing

- The draft becomes immutable (`published`); new versions are new drafts.
- The receipt (files or remote id/url) is stored on the publication and in the
  ledger (`draft.publish`). Failures are recorded (`draft.publish_failed`) and
  the draft stays `approved` for retry.
- Recommend running `scripts/analyze-url.mjs` on the live URL and adding the
  page to the site's sitemap with `lastmod`.

## Signing key

`evidentia init` creates `.evidentia/signing-key.json` (Ed25519, mode 0600).
Publish the public key at a stable URL so third parties can verify manifests;
rotate by generating a new key and keeping the old public key available.
