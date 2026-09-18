import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { canonicalJson, sha256 } from '../shared/hash.ts';

/**
 * Content provenance and AI-disclosure marking.
 *
 * Implements the technical route for EU AI Act Article 50 transparency on
 * published text: a signed, machine-readable manifest bound to the content hash
 * (Ed25519), a schema.org/IPTC JSON-LD block, meta tags, and a visible notice.
 * The manifest names the accountable human (editorial responsibility) and the
 * approval that locked the content, so the "human review / editorial control"
 * exception can be evidenced. Text watermarking is provider-side and out of scope
 * here; the manifest records which model produced the draft.
 *
 * This is standard-neutral: the AI Act and the Transparency Code of Practice
 * require signed metadata and interoperable markers but do not mandate C2PA.
 */

export interface SigningKeyPair {
  keyId: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

export function generateSigningKey(): SigningKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return { keyId: sha256(publicKeyPem).slice(0, 16), publicKeyPem, privateKeyPem };
}

export interface ContentManifest {
  version: 'evidentia-manifest/1';
  contentHash: string;
  url?: string;
  title: string;
  generatedAt: string;
  aiAssisted: boolean;
  /** IPTC digital source type vocabulary term. */
  digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture' | 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia' | 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia';
  models: string[];
  generationLogIds: string[];
  evidenceSources: string[];
  editorialResponsibility: { name: string; role: string; approvedAt: string; approvalId: string | null };
  publisher: string;
  disclosure: string;
}

export function createManifest(input: Omit<ContentManifest, 'version' | 'contentHash' | 'digitalSourceType' | 'disclosure'> & { content: string; humanEdited?: boolean }): ContentManifest {
  const { content, humanEdited, ...rest } = input;
  const digitalSourceType: ContentManifest['digitalSourceType'] = !rest.aiAssisted
    ? 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture'
    : humanEdited
      ? 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia'
      : 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia';
  const disclosure = rest.aiAssisted
    ? `This text was drafted with the assistance of an AI system (${rest.models.join(', ') || 'model not recorded'}) from the organisation's own documented sources, and was reviewed and approved by ${rest.editorialResponsibility.name} (${rest.editorialResponsibility.role}), who takes editorial responsibility for it.`
    : `This text was written and approved by ${rest.editorialResponsibility.name} (${rest.editorialResponsibility.role}) without AI assistance.`;
  return { version: 'evidentia-manifest/1', contentHash: sha256(content), digitalSourceType, disclosure, ...rest };
}

export interface SignedManifest {
  manifest: ContentManifest;
  algorithm: 'Ed25519';
  keyId: string;
  signature: string;
}

export function signManifest(manifest: ContentManifest, key: SigningKeyPair): SignedManifest {
  const data = Buffer.from(canonicalJson(manifest));
  const signature = sign(null, data, createPrivateKey(key.privateKeyPem)).toString('base64');
  return { manifest, algorithm: 'Ed25519', keyId: key.keyId, signature };
}

export function verifyManifest(signed: SignedManifest, publicKeyPem: string, content?: string): { valid: boolean; reason: string } {
  const data = Buffer.from(canonicalJson(signed.manifest));
  let ok = false;
  try {
    ok = verify(null, data, createPublicKey(publicKeyPem), Buffer.from(signed.signature, 'base64'));
  } catch {
    ok = false;
  }
  if (!ok) return { valid: false, reason: 'signature does not verify' };
  if (content !== undefined && sha256(content) !== signed.manifest.contentHash) return { valid: false, reason: 'content hash mismatch: content changed after signing' };
  return { valid: true, reason: 'ok' };
}

export interface MarkingArtifacts {
  jsonLd: Record<string, unknown>;
  metaTags: string[];
  visibleNoticeHtml: string;
  manifestJson: string;
}

/** Machine-readable and human-readable disclosure artefacts for an HTML page. */
export function markingArtifacts(signed: SignedManifest, options: { manifestUrl?: string } = {}): MarkingArtifacts {
  const m = signed.manifest;
  const jsonLd: Record<string, unknown> = {
    '@context': ['https://schema.org', { iptc: 'http://iptc.org/std/Iptc4xmpExt/2008-02-29/', evidentia: 'https://evidentia.clixite.eu/ns/manifest#' }],
    '@type': 'CreativeWork',
    name: m.title,
    ...(m.url ? { url: m.url } : {}),
    dateCreated: m.generatedAt,
    publisher: { '@type': 'Organization', name: m.publisher },
    'iptc:DigitalSourceType': m.digitalSourceType,
    creditText: m.disclosure,
    'evidentia:aiAssisted': m.aiAssisted,
    'evidentia:models': m.models,
    'evidentia:editorialResponsibility': `${m.editorialResponsibility.name} (${m.editorialResponsibility.role})`,
    'evidentia:contentHash': m.contentHash,
    'evidentia:signature': { algorithm: signed.algorithm, keyId: signed.keyId, value: signed.signature },
    ...(options.manifestUrl ? { 'evidentia:manifestUrl': options.manifestUrl } : {}),
  };
  const metaTags = [
    `<meta name="ai-disclosure" content="${m.aiAssisted ? 'ai-assisted; human-reviewed' : 'human-authored'}">`,
    `<meta name="iptc:DigitalSourceType" content="${m.digitalSourceType}">`,
    `<meta name="evidentia:content-hash" content="${m.contentHash}">`,
    `<meta name="evidentia:signature" content="${signed.algorithm}:${signed.keyId}:${signed.signature}">`,
  ];
  const visibleNoticeHtml = m.aiAssisted
    ? `<aside class="ai-disclosure" aria-label="AI disclosure"><p><strong>AI transparency notice.</strong> ${escape(m.disclosure)}</p></aside>`
    : `<aside class="ai-disclosure" aria-label="Authorship notice"><p>${escape(m.disclosure)}</p></aside>`;
  return { jsonLd, metaTags, visibleNoticeHtml, manifestJson: JSON.stringify(signed, null, 2) };
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
