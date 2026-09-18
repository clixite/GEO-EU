import type { ModelRecord } from '../governance/schemas.ts';
import { evaluateModelAccess, type Decision, type PolicyDocument } from '../governance/policy.ts';
import type { ModelRegistry } from '../governance/registers.ts';
import type { AuditLedger } from '../audit/ledger.ts';
import type { CompletionRequest, CompletionResponse, EmbeddingRequest, EmbeddingResponse, ProviderAdapter } from './types.ts';
import { CostMeter, priceCall } from './costMeter.ts';
import { EvidentiaError } from '../shared/errors.ts';
import { sha256 } from '../shared/hash.ts';
import { type Clock, systemClock } from '../shared/clock.ts';
import type { Logger } from '../observability/logger.ts';

/**
 * Policy-aware model router.
 *
 * For each request it computes the set of registry models the governance policy
 * allows for the request's data classes, ranks them by the chosen strategy, and
 * tries them in order. Fallback happens ONLY within that allowed set: a failure on
 * an approved EU model never silently escalates to a public US endpoint. Every
 * attempt is metered and audited (prompt hash only, never prompt text).
 */

export type RoutingStrategy = 'quality' | 'cost' | 'latency' | 'balanced';

export interface RouteRequest {
  tenantId: string;
  workload: string;
  dataClasses: CompletionRequest['dataClasses'];
  need: 'chat' | 'embeddings';
  strategy?: RoutingStrategy;
  /** Optional pin to one model id (provider/model); still policy-checked. */
  preferred?: string;
}

export interface RoutePlan {
  candidates: { model: ModelRecord; decision: Decision; adapter: ProviderAdapter }[];
  rejected: { model: ModelRecord; decision: Decision }[];
}

export class PolicyAwareRouter {
  readonly registry: ModelRegistry;
  readonly policy: PolicyDocument;
  readonly ledger: AuditLedger;
  readonly meter: CostMeter;
  readonly adapters: Map<string, ProviderAdapter>;
  readonly clock: Clock;
  readonly logger: Logger | undefined;
  readonly maxAttempts: number;

  constructor(options: {
    registry: ModelRegistry;
    policy: PolicyDocument;
    ledger: AuditLedger;
    meter: CostMeter;
    adapters: ProviderAdapter[];
    clock?: Clock;
    logger?: Logger;
    maxAttempts?: number;
  }) {
    this.registry = options.registry;
    this.policy = options.policy;
    this.ledger = options.ledger;
    this.meter = options.meter;
    this.adapters = new Map(options.adapters.map((a) => [a.id, a]));
    this.clock = options.clock ?? systemClock;
    this.logger = options.logger;
    this.maxAttempts = options.maxAttempts ?? 2;
  }

  plan(req: RouteRequest): RoutePlan {
    const plan: RoutePlan = { candidates: [], rejected: [] };
    for (const { record } of this.registry.list(req.tenantId)) {
      const adapter = this.adapters.get(record.adapter === 'openai-compatible' || record.adapter === 'anthropic' || record.adapter === 'google' ? record.provider : record.adapter) ?? this.adapters.get(record.provider);
      const decision = evaluateModelAccess(this.policy, record, req.dataClasses);
      const caps = adapter?.capabilities(record.model);
      const capable = req.need === 'chat' ? caps?.chat : caps?.embeddings;
      if (decision.effect !== 'allow') {
        plan.rejected.push({ model: record, decision });
        continue;
      }
      if (!adapter || !capable) {
        plan.rejected.push({ model: record, decision: { ...decision, effect: 'deny', reasons: [adapter ? `adapter lacks ${req.need}` : `no adapter registered for ${record.provider}`] } });
        continue;
      }
      if (req.preferred && `${record.provider}/${record.model}` !== req.preferred) {
        plan.rejected.push({ model: record, decision: { ...decision, effect: 'deny', reasons: ['not the preferred model'] } });
        continue;
      }
      plan.candidates.push({ model: record, decision, adapter });
    }
    plan.candidates.sort((a, b) => rank(b.model, req.strategy ?? 'balanced') - rank(a.model, req.strategy ?? 'balanced'));
    return plan;
  }

  async complete(req: RouteRequest & { request: Omit<CompletionRequest, 'tenantId' | 'workload' | 'dataClasses'> }): Promise<CompletionResponse & { attempts: number; policy: Decision }> {
    const plan = this.plan({ ...req, need: 'chat' });
    this.#assertRoutable(req, plan);
    const full: CompletionRequest = { ...req.request, tenantId: req.tenantId, workload: req.workload, dataClasses: req.dataClasses };
    const promptHash = sha256(full.messages.map((m) => `${m.role}:${m.content}`).join('\n'));
    let attempts = 0;
    let lastError: unknown;
    for (const c of plan.candidates.slice(0, this.maxAttempts)) {
      attempts += 1;
      const startedAt = this.clock.now();
      try {
        const response = await c.adapter.complete(c.model.model, full);
        const durationMs = this.clock.now().getTime() - startedAt.getTime();
        this.#record(req, c.model, c.decision, { status: 'ok', usage: response.usage, durationMs, startedAt: startedAt.toISOString(), retries: attempts - 1, promptHash, requestId: full.requestId, jobId: full.jobId });
        return { ...response, attempts, policy: c.decision };
      } catch (error) {
        lastError = error;
        const durationMs = this.clock.now().getTime() - startedAt.getTime();
        this.#record(req, c.model, c.decision, { status: 'error', usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 }, durationMs, startedAt: startedAt.toISOString(), retries: attempts - 1, promptHash, requestId: full.requestId, jobId: full.jobId });
        this.logger?.warn('model call failed, trying next policy-allowed candidate', { provider: c.model.provider, model: c.model.model, error: (error as Error).message, tenantId: req.tenantId });
      }
    }
    throw new EvidentiaError('provider_unavailable', `all ${attempts} policy-allowed model(s) failed`, { attempts, cause: (lastError as Error)?.message });
  }

  async embed(req: RouteRequest & { texts: string[]; requestId?: string }): Promise<EmbeddingResponse & { policy: Decision }> {
    const plan = this.plan({ ...req, need: 'embeddings' });
    this.#assertRoutable(req, plan);
    const c = plan.candidates[0] as RoutePlan['candidates'][number];
    const request: EmbeddingRequest = { tenantId: req.tenantId, workload: req.workload, dataClasses: req.dataClasses, texts: req.texts, ...(req.requestId ? { requestId: req.requestId } : {}) };
    const startedAt = this.clock.now();
    const response = await c.adapter.embed(c.model.model, request);
    this.#record(req, c.model, c.decision, { status: 'ok', usage: response.usage, durationMs: this.clock.now().getTime() - startedAt.getTime(), startedAt: startedAt.toISOString(), retries: 0, requestId: req.requestId });
    return { ...response, policy: c.decision };
  }

  #assertRoutable(req: RouteRequest, plan: RoutePlan): void {
    const exhausted = this.meter.exhaustedHardBudget(req.tenantId, req.workload);
    if (exhausted) {
      this.ledger.append({ tenantId: req.tenantId, actor: 'router', action: 'model.call_denied', objectType: 'workload', objectId: req.workload, evidence: { reason: 'hard budget exhausted', limitEur: exhausted.limitEur } });
      throw new EvidentiaError('policy_denied', `hard budget of ${exhausted.limitEur} EUR exhausted for ${req.workload}`, { budget: exhausted });
    }
    if (plan.candidates.length === 0) {
      const reasons = plan.rejected.map((r) => `${r.model.provider}/${r.model.model}: ${r.decision.reasons.join('; ')}`);
      this.ledger.append({ tenantId: req.tenantId, actor: 'router', action: 'model.call_denied', objectType: 'workload', objectId: req.workload, policyId: this.policy.id, evidence: { dataClasses: req.dataClasses, reasons } });
      throw new EvidentiaError('policy_denied', 'no registered model is allowed for this request under the active policy', { dataClasses: req.dataClasses, reasons });
    }
  }

  #record(req: RouteRequest, model: ModelRecord, decision: Decision, call: { status: 'ok' | 'error'; usage: CompletionResponse['usage']; durationMs: number; startedAt: string; retries: number; promptHash?: string | undefined; requestId?: string | undefined; jobId?: string | undefined }): void {
    const costEur = priceCall(model, call.usage);
    this.meter.record({ tenantId: req.tenantId, workload: req.workload, provider: model.provider, model: model.model, startedAt: call.startedAt, durationMs: call.durationMs, usage: call.usage, status: call.status, retries: call.retries, policyId: decision.policyId, ...(call.promptHash ? { promptHash: call.promptHash } : {}), ...(call.requestId ? { requestId: call.requestId } : {}), ...(call.jobId ? { jobId: call.jobId } : {}) }, costEur);
    this.ledger.append({
      tenantId: req.tenantId,
      actor: 'router',
      action: call.status === 'ok' ? 'model.call' : 'model.call_failed',
      objectType: 'workload',
      objectId: req.workload,
      modelId: `${model.provider}/${model.model}`,
      policyId: decision.policyId,
      ...(call.requestId ? { requestId: call.requestId } : {}),
      evidence: { dataClasses: req.dataClasses, matchedRules: decision.matchedRules, usage: call.usage, costEur, durationMs: call.durationMs, promptHash: call.promptHash ?? null },
    });
  }
}

function rank(m: ModelRecord, strategy: RoutingStrategy): number {
  const costScore = m.cost ? 5 - Math.min(5, (m.cost.inputPerMillionTokensEur + m.cost.outputPerMillionTokensEur) / 10) : 2.5;
  switch (strategy) {
    case 'quality':
      return m.qualityTier * 10 + costScore;
    case 'cost':
      return costScore * 10 + m.qualityTier;
    case 'latency':
      return (6 - m.latencyTier) * 10 + m.qualityTier;
    default:
      return m.qualityTier * 4 + costScore * 3 + (6 - m.latencyTier) * 2;
  }
}
