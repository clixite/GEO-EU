import type { Database } from '../storage/database.ts';
import type { AuditLedger } from '../audit/ledger.ts';
import type { ApprovalService } from '../governance/approvals.ts';
import { evaluatePublication, type PolicyDocument, type PublicationDecision } from '../governance/policy.ts';
import { createManifest, jsonForScript, markingArtifacts, signManifest, type SigningKeyPair, type SignedManifest } from '../governance/provenance.ts';
import { renderWithSources, stripMarkers, verifyDraft, type EvidenceItem, type VerificationReport } from '../content/grounding.ts';
import { escapeHtml, markdownToHtml } from '../content/markdown.ts';
import { analyzePage } from '../geo/analyzer.ts';
import type { PublishAdapter, PublishReceipt } from './adapters.ts';
import { canonicalJson, newId, sha256 } from '../shared/hash.ts';
import { type Clock, systemClock } from '../shared/clock.ts';
import { EvidentiaError, notFound } from '../shared/errors.ts';

/**
 * Content pipeline: draft → verified → gated → (awaiting approval →) approved → published.
 *
 * Governance is built into the transitions, not bolted on:
 * - verification is deterministic and stored with the draft, together with the
 *   readiness score of the rendered artefact;
 * - the gate applies the machine-readable policy and either blocks, requires a
 *   human approval bound to the exact body hash, or allows;
 * - four-eyes excludes everyone who authored or edited the draft, not only the
 *   person who requested the gate;
 * - any edit after approval returns the draft to `draft` (post-approval lock);
 * - publishing checks the approval before the adapter call and consumes it only
 *   after the adapter succeeded (a failed publish leaves the approval usable);
 * - when the policy requires machine-readable AI marking, publishing refuses to
 *   proceed without a signing key rather than silently dropping the manifest;
 * - the signed manifest names the accountable human and the recorded approver.
 * Every step is in the audit ledger.
 */

export type DraftStatus = 'draft' | 'verified' | 'blocked' | 'awaiting_approval' | 'approved' | 'rejected' | 'published';

export interface Draft {
  id: string;
  tenantId: string;
  title: string;
  slug: string;
  body: string;
  status: DraftStatus;
  language: string;
  author: string | null;
  reviewer: string | null;
  aiAssisted: boolean;
  modelId: string | null;
  evidence: EvidenceItem[];
  verification: VerificationReport | null;
  gate: PublicationDecision | null;
  approvalId: string | null;
  topics: string[];
  sourceKinds: string[];
  /** Readiness of the live target page when supplied at creation; otherwise the rendered artefact's score computed at verification. */
  readinessScore: number | null;
  readinessSource: 'target-page' | 'rendered-artefact' | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

interface Ctx {
  tenantId: string;
  actor: string;
  requestId?: string;
}

interface Row {
  id: string; tenant_id: string; title: string; slug: string; body: string; status: DraftStatus; language: string; author: string | null; reviewer: string | null;
  ai_assisted: number; model_id: string | null; evidence: string | null; readiness: string | null; gate_result: string | null; approval_id: string | null; created_at: string; updated_at: string; published_at: string | null;
}

interface StoredMeta {
  evidence: EvidenceItem[];
  verification: VerificationReport | null;
  topics: string[];
  sourceKinds: string[];
  readinessScore: number | null;
  readinessSource?: 'target-page' | 'rendered-artefact' | null;
}

function fromRow(r: Row): Draft {
  const meta: StoredMeta = r.evidence ? (JSON.parse(r.evidence) as StoredMeta) : { evidence: [], verification: null, topics: [], sourceKinds: [], readinessScore: null };
  return {
    id: r.id, tenantId: r.tenant_id, title: r.title, slug: r.slug, body: r.body, status: r.status, language: r.language, author: r.author, reviewer: r.reviewer,
    aiAssisted: r.ai_assisted === 1, modelId: r.model_id, evidence: meta.evidence, verification: meta.verification, gate: r.gate_result ? (JSON.parse(r.gate_result) as PublicationDecision) : null,
    approvalId: r.approval_id, topics: meta.topics, sourceKinds: meta.sourceKinds, readinessScore: meta.readinessScore, readinessSource: meta.readinessSource ?? (meta.readinessScore === null ? null : 'target-page'),
    createdAt: r.created_at, updatedAt: r.updated_at, publishedAt: r.published_at,
  };
}

export interface RenderedArtefacts {
  html: string;
  markdown: string;
  manifest: SignedManifest | null;
}

export class ContentPipeline {
  readonly db: Database;
  readonly ledger: AuditLedger;
  readonly approvals: ApprovalService;
  readonly policy: PolicyDocument;
  readonly clock: Clock;
  readonly adapters: Map<string, PublishAdapter>;
  readonly signingKey: SigningKeyPair | null;
  readonly publisher: string;
  /** Base URL used to score the rendered artefact at verification (no network access). */
  readonly previewBase: string;

  constructor(options: { db: Database; ledger: AuditLedger; approvals: ApprovalService; policy: PolicyDocument; adapters: PublishAdapter[]; signingKey?: SigningKeyPair; publisher: string; clock?: Clock; previewBase?: string }) {
    this.db = options.db;
    this.ledger = options.ledger;
    this.approvals = options.approvals;
    this.policy = options.policy;
    this.adapters = new Map(options.adapters.map((a) => [a.id, a]));
    this.signingKey = options.signingKey ?? null;
    this.publisher = options.publisher;
    this.clock = options.clock ?? systemClock;
    this.previewBase = options.previewBase ?? 'https://preview.invalid';
  }

  createDraft(ctx: Ctx, input: { title: string; slug: string; body: string; language?: string; author?: string; aiAssisted: boolean; modelId?: string; evidence?: EvidenceItem[]; topics?: string[]; sourceKinds?: string[]; readinessScore?: number }): Draft {
    if (!/^[a-z0-9][a-z0-9-]{0,120}$/.test(input.slug)) throw new EvidentiaError('validation', 'slug must be lowercase letters, digits and hyphens');
    const id = newId();
    const now = this.clock.now().toISOString();
    const meta: StoredMeta = { evidence: input.evidence ?? [], verification: null, topics: input.topics ?? [], sourceKinds: input.sourceKinds ?? [], readinessScore: input.readinessScore ?? null, readinessSource: input.readinessScore === undefined ? null : 'target-page' };
    this.db.raw
      .prepare('INSERT INTO drafts (id, tenant_id, title, slug, body, status, language, author, ai_assisted, model_id, evidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, ctx.tenantId, input.title, input.slug, input.body, 'draft', input.language ?? 'en', input.author ?? ctx.actor, input.aiAssisted ? 1 : 0, input.modelId ?? null, canonicalJson(meta), now, now);
    this.ledger.append({ tenantId: ctx.tenantId, actor: ctx.actor, action: 'draft.create', objectType: 'draft', objectId: id, ...(input.modelId ? { modelId: input.modelId } : {}), ...(ctx.requestId ? { requestId: ctx.requestId } : {}), newState: { title: input.title, slug: input.slug, aiAssisted: input.aiAssisted, bodyHash: sha256(input.body), evidence: meta.evidence.length, author: input.author ?? ctx.actor } });
    return this.get(ctx.tenantId, id);
  }

  get(tenantId: string, id: string): Draft {
    const row = this.db.raw.prepare('SELECT * FROM drafts WHERE tenant_id = ? AND id = ?').get(tenantId, id) as unknown as Row | undefined;
    if (!row) throw notFound('draft', id);
    return fromRow(row);
  }

  list(tenantId: string, status?: DraftStatus): Draft[] {
    const rows = (status
      ? this.db.raw.prepare('SELECT * FROM drafts WHERE tenant_id = ? AND status = ? ORDER BY updated_at DESC').all(tenantId, status)
      : this.db.raw.prepare('SELECT * FROM drafts WHERE tenant_id = ? ORDER BY updated_at DESC').all(tenantId)) as unknown as Row[];
    return rows.map(fromRow);
  }

  /** Edit body/title. Any edit after approval or gating returns the draft to `draft` and voids the approval. */
  updateDraft(ctx: Ctx, id: string, changes: { title?: string; body?: string; evidence?: EvidenceItem[]; aiAssisted?: boolean; modelId?: string }): Draft {
    const d = this.get(ctx.tenantId, id);
    if (d.status === 'published') throw new EvidentiaError('conflict', 'published drafts are immutable; create a new version');
    const keepTarget = d.readinessSource === 'target-page';
    const meta: StoredMeta = { evidence: changes.evidence ?? d.evidence, verification: null, topics: d.topics, sourceKinds: d.sourceKinds, readinessScore: keepTarget ? d.readinessScore : null, readinessSource: keepTarget ? 'target-page' : null };
    const now = this.clock.now().toISOString();
    this.db.raw
      .prepare("UPDATE drafts SET title = ?, body = ?, evidence = ?, ai_assisted = ?, model_id = ?, status = 'draft', gate_result = NULL, approval_id = NULL, updated_at = ? WHERE id = ?")
      .run(changes.title ?? d.title, changes.body ?? d.body, canonicalJson(meta), (changes.aiAssisted ?? d.aiAssisted) ? 1 : 0, changes.modelId ?? d.modelId, now, id);
    this.ledger.append({ tenantId: ctx.tenantId, actor: ctx.actor, action: 'draft.update', objectType: 'draft', objectId: id, previousState: { status: d.status, bodyHash: sha256(d.body), approvalId: d.approvalId }, newState: { status: 'draft', bodyHash: sha256(changes.body ?? d.body) } });
    return this.get(ctx.tenantId, id);
  }

  /** Deterministic evidence verification plus readiness of the rendered artefact. */
  verify(ctx: Ctx, id: string): Draft {
    const d = this.get(ctx.tenantId, id);
    if (d.status === 'published') throw new EvidentiaError('conflict', 'published drafts are immutable');
    const report = verifyDraft(d.body, d.evidence);
    let readinessScore = d.readinessScore;
    let readinessSource = d.readinessSource;
    if (readinessSource !== 'target-page') {
      const preview = this.#document(d, { bodyHtml: markdownToHtml(stripMarkers(renderWithSources(d.body, d.evidence))), metaBlock: this.#seoMeta(d, null), disclosureBlock: '' });
      readinessScore = analyzePage({ url: `${this.previewBase}/${d.slug}`, html: preview }).score;
      readinessSource = 'rendered-artefact';
    }
    const meta: StoredMeta = { evidence: d.evidence, verification: report, topics: d.topics, sourceKinds: d.sourceKinds, readinessScore, readinessSource };
    this.db.raw.prepare("UPDATE drafts SET evidence = ?, status = 'verified', gate_result = NULL, approval_id = NULL, updated_at = ? WHERE id = ?").run(canonicalJson(meta), this.clock.now().toISOString(), id);
    this.ledger.append({ tenantId: ctx.tenantId, actor: ctx.actor, action: 'draft.verify', objectType: 'draft', objectId: id, evidence: { materialClaims: report.materialClaims, supportedClaims: report.supportedClaims, unsupportedClaims: report.unsupportedClaims, evidenceCoverage: report.evidenceCoverage, placeholders: report.placeholders.length, readinessScore, readinessSource } });
    return this.get(ctx.tenantId, id);
  }

  /** Apply the publication policy. Blocks, requests approval, or approves outright. */
  gate(ctx: Ctx, id: string): Draft {
    const d = this.get(ctx.tenantId, id);
    if (d.status !== 'verified') throw new EvidentiaError('conflict', `draft must be verified before gating (status ${d.status})`);
    const v = d.verification as VerificationReport;
    const decision = evaluatePublication(this.policy, {
      aiAssisted: d.aiAssisted, readinessScore: d.readinessScore, evidenceCoverage: v.evidenceCoverage, unsupportedClaims: v.unsupportedClaims + v.placeholders.length, topics: d.topics, sourceKinds: d.sourceKinds,
    });
    let status: DraftStatus;
    let approvalId: string | null = null;
    if (decision.effect === 'deny') status = 'blocked';
    else if (decision.effect === 'require_approval') {
      const a = this.approvals.request({ tenantId: ctx.tenantId, action: 'draft.publish', objectType: 'draft', objectId: id, requestedBy: ctx.actor, payload: this.#payload(d), reason: decision.reasons.join('; '), policyId: this.policy.id, ...(ctx.requestId ? { requestId: ctx.requestId } : {}) });
      approvalId = a.id;
      status = 'awaiting_approval';
    } else status = 'approved';
    this.db.raw.prepare('UPDATE drafts SET status = ?, gate_result = ?, approval_id = ?, updated_at = ? WHERE id = ?').run(status, canonicalJson(decision), approvalId, this.clock.now().toISOString(), id);
    this.ledger.append({ tenantId: ctx.tenantId, actor: ctx.actor, action: `draft.gate.${decision.effect}`, objectType: 'draft', objectId: id, policyId: this.policy.id, ...(approvalId ? { approvalId } : {}), previousState: { status: d.status }, newState: { status }, evidence: { reasons: decision.reasons, blockers: decision.blockers, warnings: decision.warnings, requiresDisclosure: decision.requiresDisclosure, requiresMachineReadableMarking: decision.requiresMachineReadableMarking } });
    return this.get(ctx.tenantId, id);
  }

  /** Everyone who authored or edited the draft (from the ledger), for the four-eyes rule. */
  contributors(tenantId: string, id: string): string[] {
    const d = this.get(tenantId, id);
    const actors = new Set<string>();
    if (d.author) actors.add(d.author);
    for (const e of this.ledger.list({ tenantId, objectType: 'draft', objectId: id, limit: 10_000 })) {
      if (e.action === 'draft.create' || e.action === 'draft.update') actors.add(e.actor);
    }
    return [...actors];
  }

  /** Human decision on a draft awaiting approval (four-eyes against every contributor, enforced by ApprovalService). */
  decide(ctx: Ctx, id: string, decision: 'approved' | 'rejected', note?: string): Draft {
    const d = this.get(ctx.tenantId, id);
    if (d.status !== 'awaiting_approval' || !d.approvalId) throw new EvidentiaError('conflict', `draft is not awaiting approval (status ${d.status})`);
    this.approvals.decide({ tenantId: ctx.tenantId, id: d.approvalId, decidedBy: ctx.actor, decision, excludedActors: this.contributors(ctx.tenantId, id), ...(note ? { note } : {}) });
    const status: DraftStatus = decision === 'approved' ? 'approved' : 'rejected';
    this.db.raw.prepare('UPDATE drafts SET status = ?, reviewer = ?, updated_at = ? WHERE id = ?').run(status, ctx.actor, this.clock.now().toISOString(), id);
    this.ledger.append({ tenantId: ctx.tenantId, actor: ctx.actor, action: `draft.${decision}`, objectType: 'draft', objectId: id, approvalId: d.approvalId, previousState: { status: 'awaiting_approval' }, newState: { status }, ...(note ? { evidence: { note } } : {}) });
    return this.get(ctx.tenantId, id);
  }

  /** Whether a human changed the text after creation (ledger-derived; never assumed from `aiAssisted`). */
  humanEdited(tenantId: string, id: string): boolean {
    return this.ledger.list({ tenantId, objectType: 'draft', objectId: id, action: 'draft.update', limit: 1 }).length > 0;
  }

  /** Build the publishable artefacts (used by publish and by previews). */
  render(d: Draft, editorial: { name: string; role: string }): RenderedArtefacts {
    const gate = d.gate;
    const markdown = renderWithSources(d.body, d.evidence);
    const bodyHtml = markdownToHtml(stripMarkers(markdown));
    let manifest: SignedManifest | null = null;
    let disclosureBlock = '';
    let metaBlock = this.#seoMeta(d, editorial);
    if (this.signingKey) {
      const m = createManifest({
        content: d.body, title: d.title, generatedAt: d.createdAt, aiAssisted: d.aiAssisted, humanEdited: !d.aiAssisted || this.humanEdited(d.tenantId, d.id), models: d.modelId ? [d.modelId] : [], generationLogIds: [],
        evidenceSources: [...new Set(d.evidence.map((e) => e.locator))],
        editorialResponsibility: { name: editorial.name, role: editorial.role, approvedAt: d.updatedAt, approvalId: d.approvalId, approvedBy: d.approvalId ? d.reviewer : null },
        publisher: this.publisher,
      });
      manifest = signManifest(m, this.signingKey);
      const art = markingArtifacts(manifest);
      // jsonForScript() escapes <, >, & and line separators specifically so this cannot break
      // out of the <script> element (see governance/provenance.ts and the "jsonForScript
      // escapes HTML-significant characters" test); Semgrep cannot see through that call and
      // flags any dynamic content inside a manually built <script> tag regardless.
      metaBlock += `\n${art.metaTags.join('\n')}\n<script type="application/ld+json">${jsonForScript(art.jsonLd)}</script>`; // nosemgrep: javascript.express.security.injection.raw-html-format.raw-html-format
      if (gate?.requiresDisclosure || d.aiAssisted) disclosureBlock = art.visibleNoticeHtml;
    } else if (d.aiAssisted) {
      disclosureBlock = `<aside class="ai-disclosure" aria-label="AI disclosure"><p><strong>AI transparency notice.</strong> This text was drafted with AI assistance${d.reviewer ? ` and approved by ${escapeHtml(d.reviewer)}` : ''}; it is published under the editorial responsibility of ${escapeHtml(editorial.name)} (${escapeHtml(editorial.role)}).</p></aside>`;
    }
    return { html: this.#document(d, { bodyHtml, metaBlock, disclosureBlock }), markdown, manifest };
  }

  async publish(ctx: Ctx, id: string, target: string, editorial: { name: string; role: string }): Promise<{ draft: Draft; receipt: PublishReceipt }> {
    const d = this.get(ctx.tenantId, id);
    if (d.status !== 'approved') throw new EvidentiaError('approval_required', `draft must be approved before publishing (status ${d.status})`);
    const adapter = this.adapters.get(target);
    if (!adapter) throw new EvidentiaError('not_found', `unknown publishing target ${target}`, { target });
    if (d.gate?.requiresMachineReadableMarking && !this.signingKey) {
      throw new EvidentiaError('policy_denied', 'policy requires machine-readable AI marking, but no provenance signing key is configured (EVIDENTIA_SIGNING_KEY)', { draftId: id });
    }
    if (!editorial.name.trim() || !editorial.role.trim()) throw new EvidentiaError('validation', 'editorial responsibility requires a name and a role');
    const payload = this.#payload(d);
    if (d.approvalId) this.approvals.assertValid({ tenantId: ctx.tenantId, id: d.approvalId, payload });
    const requestId = ctx.requestId ?? newId();
    const artefacts = this.render(d, editorial);
    const pubId = newId();
    const now = this.clock.now().toISOString();
    this.db.raw.prepare("INSERT INTO publications (id, tenant_id, draft_id, target, status, request_id, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)").run(pubId, ctx.tenantId, id, target, requestId, now);
    let receipt: PublishReceipt;
    try {
      receipt = await adapter.publish({ slug: d.slug, title: d.title, html: artefacts.html, markdown: artefacts.markdown, language: d.language, manifest: artefacts.manifest, metadata: { draftId: id, tenantId: ctx.tenantId, contentHash: sha256(d.body) }, requestId });
    } catch (error) {
      this.db.raw.prepare("UPDATE publications SET status = 'failed', receipt = ?, completed_at = ? WHERE id = ?").run(canonicalJson({ error: (error as Error).message }), this.clock.now().toISOString(), pubId);
      this.ledger.append({ tenantId: ctx.tenantId, actor: ctx.actor, action: 'draft.publish_failed', objectType: 'draft', objectId: id, requestId, evidence: { target, error: (error as Error).message, approvalRetained: !!d.approvalId } });
      throw error;
    }
    // Consume only after the adapter succeeded: a failed publish must not burn the approval.
    if (d.approvalId) this.approvals.consume({ tenantId: ctx.tenantId, id: d.approvalId, payload, actor: ctx.actor });
    const done = this.clock.now().toISOString();
    this.db.raw.prepare("UPDATE publications SET status = 'published', receipt = ?, completed_at = ? WHERE id = ?").run(canonicalJson(receipt), done, pubId);
    this.db.raw.prepare("UPDATE drafts SET status = 'published', published_at = ?, updated_at = ? WHERE id = ?").run(done, done, id);
    this.ledger.append({
      tenantId: ctx.tenantId, actor: ctx.actor, action: 'draft.publish', objectType: 'draft', objectId: id, requestId, ...(d.approvalId ? { approvalId: d.approvalId } : {}), ...(d.modelId ? { modelId: d.modelId } : {}), policyId: this.policy.id,
      previousState: { status: 'approved' }, newState: { status: 'published', target, contentHash: sha256(d.body) },
      evidence: { receipt: receipt.receipt, manifestKeyId: artefacts.manifest?.keyId ?? null, editorialResponsibility: editorial, approvedBy: d.reviewer, disclosure: !!d.gate?.requiresDisclosure, machineReadableMarking: !!artefacts.manifest },
    });
    return { draft: this.get(ctx.tenantId, id), receipt };
  }

  #payload(d: Draft): Record<string, unknown> {
    return { draftId: d.id, bodyHash: sha256(d.body), title: d.title, slug: d.slug, aiAssisted: d.aiAssisted };
  }

  /** Description + Article JSON-LD so the published artefact is self-describing (dates, author, publisher, citations). */
  #seoMeta(d: Draft, editorial: { name: string; role: string } | null): string {
    const firstParagraph = stripMarkers(d.body).split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !p.startsWith('#')) ?? d.title;
    const description = firstParagraph.replace(/\s+/g, ' ').slice(0, 155);
    const article: Record<string, unknown> = {
      '@context': 'https://schema.org', '@type': 'Article', headline: d.title, inLanguage: d.language, datePublished: d.createdAt, dateModified: d.updatedAt,
      publisher: { '@type': 'Organization', name: this.publisher },
      ...(editorial ? { author: { '@type': 'Person', name: editorial.name, jobTitle: editorial.role } } : {}),
      ...(d.evidence.length ? { citation: [...new Set(d.evidence.map((e) => e.locator))] } : {}),
    };
    // The meta content is escapeHtml()'d (quotes/angle-brackets/ampersands) and the JSON-LD is
    // jsonForScript()'d (escapes </script> breakout and HTML-significant characters); see the
    // note on the sibling call in render() above.
    return `<meta name="description" content="${escapeHtml(description)}">\n<script type="application/ld+json">${jsonForScript(article)}</script>`; // nosemgrep: javascript.express.security.injection.raw-html-format.raw-html-format
  }

  #document(d: Draft, parts: { bodyHtml: string; metaBlock: string; disclosureBlock: string }): string {
    return `<!doctype html>\n<html lang="${escapeHtml(d.language)}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${escapeHtml(d.title)}</title>\n${parts.metaBlock}\n</head>\n<body>\n<main>\n<article>\n${parts.bodyHtml}\n${parts.disclosureBlock}\n</article>\n</main>\n</body>\n</html>\n`;
  }
}
