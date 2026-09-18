import type { Database } from '../storage/database.ts';
import type { ModelRecord } from '../governance/schemas.ts';
import type { TokenUsage } from './types.ts';
import { newId } from '../shared/hash.ts';
import { type Clock, systemClock } from '../shared/clock.ts';

/**
 * Cost governance: every model call is metered (tokens, duration, retries, status,
 * cost in EUR when the registry knows the price). Budgets are per tenant and
 * optional per workload; exceeding a budget raises an alert callback and, when
 * `hard` is set, blocks further calls through the router.
 */

export interface ModelCallRecord {
  tenantId: string;
  workload: string;
  provider: string;
  model: string;
  startedAt: string;
  durationMs: number;
  usage: TokenUsage;
  status: 'ok' | 'error' | 'denied';
  retries: number;
  requestId?: string;
  jobId?: string;
  policyId?: string;
  promptHash?: string;
}

export interface Budget {
  tenantId: string;
  workload?: string;
  /** Rolling window in days. */
  windowDays: number;
  limitEur: number;
  hard: boolean;
  /**
   * Call-count ceiling for the same window, independent of cost. A model with no
   * price in the registry records `costEur: null` and is invisible to `limitEur`
   * (SUM ignores nulls), so an unpriced or misconfigured model could otherwise be
   * called without limit under a "hard" budget. Set this whenever unpriced models
   * may be routed under this budget.
   */
  maxCalls?: number;
}

export interface CostSummary {
  calls: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costEur: number;
  byModel: Record<string, { calls: number; costEur: number }>;
  byWorkload: Record<string, { calls: number; costEur: number }>;
}

export function priceCall(record: ModelRecord | undefined, usage: TokenUsage): number | null {
  if (!record?.cost) return null;
  const c = record.cost;
  const cachedRate = c.cachedInputPerMillionTokensEur ?? c.inputPerMillionTokensEur;
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return (uncached * c.inputPerMillionTokensEur + usage.cachedInputTokens * cachedRate + usage.outputTokens * c.outputPerMillionTokensEur) / 1_000_000;
}

export class CostMeter {
  readonly db: Database;
  readonly clock: Clock;
  #budgets: Budget[] = [];
  #alert: (b: Budget, spent: number) => void;

  constructor(db: Database, options: { clock?: Clock; budgets?: Budget[]; onBudgetExceeded?: (b: Budget, spent: number) => void } = {}) {
    this.db = db;
    this.clock = options.clock ?? systemClock;
    this.#budgets = options.budgets ?? [];
    this.#alert = options.onBudgetExceeded ?? (() => {});
  }

  setBudgets(budgets: Budget[]): void {
    this.#budgets = budgets;
  }

  record(call: ModelCallRecord, costEur: number | null): string {
    const id = newId();
    this.db.raw
      .prepare(
        `INSERT INTO model_calls (id, tenant_id, request_id, job_id, workload, provider, model, started_at, duration_ms,
           input_tokens, output_tokens, cached_tokens, cost_eur, status, retries, policy_id, prompt_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, call.tenantId, call.requestId ?? null, call.jobId ?? null, call.workload, call.provider, call.model, call.startedAt, call.durationMs,
        call.usage.inputTokens, call.usage.outputTokens, call.usage.cachedInputTokens, costEur, call.status, call.retries, call.policyId ?? null, call.promptHash ?? null);
    for (const b of this.#budgets) {
      if (b.tenantId !== call.tenantId || (b.workload && b.workload !== call.workload)) continue;
      const spent = this.spent(b);
      if (spent > b.limitEur) this.#alert(b, spent);
      else if (costEur === null && b.maxCalls !== undefined && this.callCount(b) > b.maxCalls) this.#alert(b, spent);
    }
    return id;
  }

  spent(budget: Budget): number {
    const since = new Date(this.clock.now().getTime() - budget.windowDays * 86_400_000).toISOString();
    const row = this.db.raw
      .prepare(
        `SELECT COALESCE(SUM(cost_eur), 0) AS c FROM model_calls WHERE tenant_id = ? AND started_at >= ? ${budget.workload ? 'AND workload = ?' : ''}`,
      )
      .get(...(budget.workload ? [budget.tenantId, since, budget.workload] : [budget.tenantId, since])) as unknown as { c: number };
    return row.c;
  }

  /** Number of calls in the budget's window, regardless of price — the fallback signal for unpriced models (see `Budget.maxCalls`). */
  callCount(budget: Budget): number {
    const since = new Date(this.clock.now().getTime() - budget.windowDays * 86_400_000).toISOString();
    const row = this.db.raw
      .prepare(`SELECT COUNT(*) AS c FROM model_calls WHERE tenant_id = ? AND started_at >= ? ${budget.workload ? 'AND workload = ?' : ''}`)
      .get(...(budget.workload ? [budget.tenantId, since, budget.workload] : [budget.tenantId, since])) as unknown as { c: number };
    return row.c;
  }

  /** Returns the hard budget that is exhausted for this tenant/workload, if any — by euro spend, or by raw call count when `maxCalls` is set (catches unpriced models that never contribute to `spent`). */
  exhaustedHardBudget(tenantId: string, workload: string): Budget | undefined {
    return this.#budgets.find((b) => {
      if (!b.hard || b.tenantId !== tenantId || (b.workload && b.workload !== workload)) return false;
      if (this.spent(b) >= b.limitEur) return true;
      return b.maxCalls !== undefined && this.callCount(b) >= b.maxCalls;
    });
  }

  summary(tenantId: string, sinceIso?: string): CostSummary {
    const rows = this.db.raw
      .prepare('SELECT provider, model, workload, status, input_tokens, output_tokens, cached_tokens, cost_eur FROM model_calls WHERE tenant_id = ? AND started_at >= ?')
      .all(tenantId, sinceIso ?? '0000') as unknown as {
      provider: string; model: string; workload: string; status: string; input_tokens: number; output_tokens: number; cached_tokens: number; cost_eur: number | null;
    }[];
    const s: CostSummary = { calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costEur: 0, byModel: {}, byWorkload: {} };
    for (const r of rows) {
      s.calls += 1;
      if (r.status !== 'ok') s.errors += 1;
      s.inputTokens += r.input_tokens;
      s.outputTokens += r.output_tokens;
      s.cachedInputTokens += r.cached_tokens;
      const cost = r.cost_eur ?? 0;
      s.costEur += cost;
      const mk = `${r.provider}/${r.model}`;
      s.byModel[mk] = { calls: (s.byModel[mk]?.calls ?? 0) + 1, costEur: (s.byModel[mk]?.costEur ?? 0) + cost };
      s.byWorkload[r.workload] = { calls: (s.byWorkload[r.workload]?.calls ?? 0) + 1, costEur: (s.byWorkload[r.workload]?.costEur ?? 0) + cost };
    }
    return s;
  }
}
