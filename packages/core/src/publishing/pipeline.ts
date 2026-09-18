import type { Database } from '../storage/database.ts';
import type { AuditLedger } from '../audit/ledger.ts';
import type { ApprovalService } from '../governance/approvals.ts';
import { evaluatePublication, type PolicyDocument, type PublicationDecision } from '../governance/policy.ts';
import { createManifest, markingArtifacts, signManifest, type SigningKeyPair, type SignedManifest } from '../governance/provenance.ts';
import { renderWithSources, stripMarkers, verifyDraft, type EvidenceItem, type VerificationReport } from '../content/grounding.ts';
import { escapeHtml, markdownToHtml } from '../content/markdown.ts';
import type { PublishAdapter, PublishReceipt } from './adapters.ts';
import { canonicalJson, newId, sha256 } from '../shared/hash.ts';
import { type Clock, systemClock } from '../shared/clock.ts';
import { EvidentiaError, notFound } from '../shared/errors.ts';

/**
 * Content pipeline: draft → verified → gated → (awaiting approval →) approved → published.
 *
 * Governance is built into the transitions, not bolted on:
 * - verification is deterministic and stored with the draft;
 * - the gate applies the machine-readable policy and either blocks, requires a
 *   human approval bound to the exact body hash, or allows;
 * - any edit after approval returns the draft to `draft` (post-approval lock);
 * - publishing consumes the approval (replay-proof), signs a provenance manifest
 *   naming the accountable human, injects the AI disclosure when required, and
 *   records a receipt. Every step is in the audit ledger.
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
  readinessScore: number | null;
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
}

function fromRow(r: Row): Draft {
  const meta: StoredMeta = r.evidence ? (JSON.parse(r.evidence) as StoredMeta) : { evidence: [], verification: null, topics: [], sourceKinds: [], readinessScore: null };
  return {
    id: r.id, tenantId: r.tenant_id, title: r.title, slug: r.slug, body: r.body, status: r.status, language: r.language, author: r.author, reviewer: r.reviewer,
    aiAssisted: r.ai_assisted === 1, modelId: r.model_id, evidence: meta.evidence, verification: meta.verification, gate: r.gate_result ? (JSON.parse(r.gate_result) as PublicationDecision) : null,
    approvalId: r.approval_id, topics: meta.topics, sourceKinds: meta.sourceKinds, readinessScore: meta.readinessScore, createdAt: r.created_at, updatedAt: r.updated_at, publishedAt: r.published_at,
  };
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

  constructor(options: { db: Database; ledger: AuditLedger; approvals: ApprovalService; policy: PolicyDocument; adapters: PublishAdapter[]; signingKey?: SigningKeyPair; publisher: string; clock?: Clock }) {
    this.db = options.db;
    this.ledger = options.ledger;
    this.approvals = options.approvals;
    this.policy = options.policy;
    this.adapters = new Map(options.adapters.map((a) => [a.id, a]));
    this.signingKey = options.signingKey ?? null;
    this.publisher = options.publisher;
    this.clock = options.clock ?? systemClock;
  }

  createDraft(ctx: Ctx, input: { title: string; slug: string; body: string; language?: string; author?: string; aiAssisted: boolean; modelId?: string; evidence?: EvidenceItem[]; topics?: string[]; sourceKinds?: string[]; readinessScore?: number }): Draft {
    if (!/^[a-z0-9][a-z0-9-]{0,120}$/.test(input.slug)) throw new EvidentiaError('validation', 'slug must be lowercase letters, digits and hyphens');
    const id = newId();
    const now = this.clock.now().toISOString();
    const meta: StoredMeta = { evidence: input.evidence ?? [], verification: null, topics: input.topics ?? [], sourceKinds: input.sourceKinds ?? [], readinessScore: input.readinessScore ?? null };
    this.db.raw
      .prepare('INSERT INTO drafts (id, tenant_id, title, slug, body, status, language, author, ai_assisted, model_id, evidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, ctx.tenantId, input.title, input.slug, input.body, 'draft', input.language ?? 'en', input.author ?? null, input.aiAssisted ? 1 : 0, input.modelId ?? null, canonicalJson(meta), now, now);
    this.ledger.append({ tenantId: ctx.tenantId, actor: ctx.actor, action: 'draft.create', objectType: 'draft', objectId: id, ...(input.modelId ? { modelId: input.modelId } : {}), ...(ctx.requestId ? { requestId: ctx.requestId } : {}), newState: { title: input.title, slug: input.slug, aiAssisted: input.aiAssisted, bodyHash: sha256(input.body), evidence: meta.evidence.length } });
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
    const meta: StoredMeta = { evidence: changes.evidence ?? d.evidence, verification: null, topics: d.topics, sourceKinds: d.sourceKinds, readinessScore: d.readinessScore };
    const now = this.clock.now().toISOString();
    this.db.raw
      .prepare("UPDATE drafts SET title = ?, body = ?, evidence = ?, ai_assisted = ?, model_id = ?, status = 'draft', gate_result = NULL, approval_id = NULL, updated_at = ? WHERE id = ?")
      .run(changes.title ?? d.title, changes.body ?? d.body, canonicalJson(meta), (changes.aiAssisted ?? d.aiAssisted) ? 1 : 0, changes.modelId ?? d.modelId, now, id);
    this.ledger.append({ tenantId: ctx.tenantId, actor: ctx.actor, action: 'draft.update', objectType: 'draft', objectId: id, previousState: { status: d.status, bodyHash: sha256(d.body), approvalId: d.approvalId }, newState: { status: 'draft', bodyHash: sha256(changes.body ?? d.body) } });
    return this.get(ctx.tenantId, id);
  }

  verify(ctx: Ctx, id: string): Draft {
    const d = this.get(ctx.tenantId, id);
    if (d.status === 'published') throw new EvidentiaError('conflict', 'published drafts are immutable');
    const report = verifyDraft(d.body, d.evidence);
    const meta: StoredMeta = { evidence: d.evidence, verification: report, topics: d.topics, sourceKinds: d.sourceKinds, readinessScore: d.readinessScore };
    this.db.raw.prepare("UPDATE drafts SET evidence = ?, status = 'verified', gate_result = NULL, approval_id = NULL, updated_at = ? WHERE id = ?").run(canonicalJson(meta), this.clock.now().toISOString(), id);
    this.ledger.append({ tenantId: ctx.tenantId, actor: ctx.actor, action: 'draft.verify', objectType: 'draft', objectId: id, evidence: { materialClaims: report.materialClaims, supportedClaims: report.supportedClaims, unsupportedClaims: report.unsupportedClaims, evidenceCoverage: report.evidenceCoverage, placeholders: report.placeholders.length } });
    return this.get(ctx.tenantId, id);
  }

  /** Apply the publication policy. Blocks, requests approval, or approves outright. */
  gate(ctx: Ctx, id: string): Draft {
    const d = this.get(ctx.tenantId, id);
    if (d.status !== 'verified') throw new EvidentiaError('conflict', `draft must be verified before gating (status ${d.status})`);
    const v = d.verification as VerificationReport;
    const decision = evaluatePublication(this.policy, {
      aiAssisted: d.aiAssisted, readinessScore: d.readinessScore ?? 100, evidenceCoverage: v.evidenceCoverage, unsupportedClaims: v.unsupportedClaims + v.placeholders.length, topics: d.topics, sourceKinds: d.sourceKinds,
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
    this.ledger.append({ tenantId: ctx.tenantId, actor: ctx.actor, action: `draft.gate.${decision.effect}`, objectType: 'draft', objectId: id, policyId: this.policy.id, ...(approvalId ? { approvalId } : {}), previousState: { status: d.status }, newState: { status }, evidence: { reasons: decision.reasons, blockers: decision.blockers, requiresDisclosure: decision.requiresDisclosure } });
    return this.get(ctx.tenantId, id);
  }

  /** Human decision on a draft awaiting approval (four-eyes enforced by ApprovalService). */
  decide(ctx: Ctx, id: string, decision: 'approved' | 'rejected', note?: string): Draft {
    const d = this.get(ctx.tenantId, id);
    if (d.status !== 'awaiting_approval' || !d.approvalId) throw new EvidentiaError('conflict', `draft is not awaiting approval (status ${d.status})`);
    this.approvals.decide({ tenantId: ctx.tenantId, id: d.approvalId, decidedBy: ctx.actor, decision, ...(note ? { note } : {}) });
    const status: DraftStatus = decision === 'approved' ? 'approved' : 'rejected';
    this.db.raw.prepare('UPDATE drafts SET status = ?, reviewer = ?, updated_at = ? WHERE id = ?').run(status, ctx.actor, this.clock.now().toISOString(), id);
    this.ledger.append({ tenantId: ctx.tenantId, actor: ctx.actor, action: `draft.${decision}`, objectType: 'draft', objectId: id, approvalId: d.approvalId, previousState: { status: 'awaiting_approval' }, newState: { status }, ...(note ? { evidence: { note } } : {}) });
    return this.get(ctx.tenantId, id);
  }

  /** Build the publishable artefacts (used by publish and by previews). */
  render(d: Draft, editorial: { name: string; role: string }): { html: string; markdown: string; manifest: SignedManifest | null } {
    const gate = d.gate;
    const markdown = renderWithSources(d.body, d.evidence);
    const bodyHtml = markdownToHtml(stripMarkers(markdown));
    let manifest: SignedManifest | null = null;
    let disclosureBlock = '';
    let metaBlock = '';
    if (this.signingKey) {
      const m = createManifest({
        content: d.body, title: d.title, generatedAt: d.createdAt, aiAssisted: d.aiAssisted, humanEdited: d.aiAssisted, models: d.modelId ? [d.modelId] : [], generationLogIds: [],
        evidenceSources: [...new Set(d.evidence.map((e) => e.locator))], editorialResponsibility: { name: editorial.name, role: editorial.role, approvedAt: d.updatedAt, approvalId: d.approvalId }, publisher: this.publisher,
      });
      manifest = signManifest(m, this.signingKey);
      const art = markingArtifacts(manifest);
      metaBlock = `${art.metaTags.join('\n')}\n<script type="application/ld+json">${JSON.stringify(art.jsonLd)}</script>`;
      if (gate?.requiresDisclosure || d.aiAssisted) disclosureBlock = art.visibleNoticeHtml;
    } else if (d.aiAssisted) {
      disclosureBlock = `<aside class="ai-disclosure" aria-label="AI disclosure"><p><strong>AI transparency notice.</strong> This text was drafted with AI assistance and reviewed by ${escapeHtml(editorial.name)} (${escapeHtml(editorial.role)}).</p></aside>`;
    }
    const html = `<!doctype html>\n<html lang="${escapeHtml(d.language)}">\n<head>\n<meta charset="utf-8">\n<title>${escapeHtml(d.title)}</title>\n${metaBlock}\n</head>\n<body>\n<main>\n<article>\n${bodyHtml}\n${disclosureBlock}\n</article>\n</main>\n</body>\n</html>\n`;
    return { html, markdown, manifest };
  }

  async publish(ctx: Ctx, id: string, target: string, editorial: { name: string; role: string }): Promise<{ draft: Draft; receipt: PublishReceipt }> {
    const d = this.get(ctx.tenantId, id);
    if (d.status !== 'approved') throw new EvidentiaError('approval_required', `draft must be approved before publishing (status ${d.status})`);
    const adapter = this.adapters.get(target);
    if (!adapter) throw new EvidentiaError('not_found', `unknown publishing target ${target}`, { target });
    if (d.approvalId) this.approvals.consume({ tenantId: ctx.tenantId, id: d.approvalId, payload: this.#payload(d), actor: ctx.actor });
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
      this.ledger.append({ tenantId: ctx.tenantId, actor: ctx.actor, action: 'draft.publish_failed', objectType: 'draft', objectId: id, requestId, evidence: { target, error: (error as Error).message } });
      throw error;
    }
    const done = this.clock.now().toISOString();
    this.db.raw.prepare("UPDATE publications SET status = 'published', receipt = ?, completed_at = ? WHERE id = ?").run(canonicalJson(receipt), done, pubId);
    this.db.raw.prepare("UPDATE drafts SET status = 'published', published_at = ?, updated_at = ? WHERE id = ?").run(done, done, id);
    this.ledger.append({
      tenantId: ctx.tenantId, actor: ctx.actor, action: 'draft.publish', objectType: 'draft', objectId: id, requestId, ...(d.approvalId ? { approvalId: d.approvalId } : {}), ...(d.modelId ? { modelId: d.modelId } : {}), policyId: this.policy.id,
      previousState: { status: 'approved' }, newState: { status: 'published', target, contentHash: sha256(d.body) },
      evidence: { receipt: receipt.receipt, manifestKeyId: artefacts.manifest?.keyId ?? null, editorialResponsibility: editorial, disclosure: !!d.gate?.requiresDisclosure },
    });
    return { draft: this.get(ctx.tenantId, id), receipt };
  }

  #payload(d: Draft): Record<string, unknown> {
    return { draftId: d.id, bodyHash: sha256(d.body), title: d.title, slug: d.slug, aiAssisted: d.aiAssisted };
  }
}
