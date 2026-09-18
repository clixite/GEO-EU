import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AiSystemRegister, ApprovalService, AuditLedger, ContentPipeline, CostMeter, DemoProvider, HybridRetriever, KnowledgeStore, Logger, ModelRegistry, Observatory,
  PolicyAwareRouter, ProcessingRegister, buildAdapters, envSecrets, generateSigningKey, openDatabase, parsePolicy, type Budget, type Database, type PolicyDocument, type ProviderAdapter, type SigningKeyPair,
} from '@evidentia/core';

/**
 * Parse EVIDENTIA_BUDGETS: a JSON array of `Budget` objects. Without this,
 * `CostMeter` is created with no budgets and never blocks spend, silently —
 * cost governance exists in the code but does nothing until an operator sets
 * this. Example: `[{"tenantId":"acme","windowDays":30,"limitEur":500,"hard":true,"maxCalls":50000}]`.
 */
export function parseBudgets(json: string | undefined, tenantId: string): Budget[] {
  if (!json) return [];
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('EVIDENTIA_BUDGETS must be a JSON array');
  return parsed.map((b: { tenantId?: unknown; workload?: unknown; windowDays?: unknown; limitEur?: unknown; hard?: unknown; maxCalls?: unknown }) => {
    if (typeof b.windowDays !== 'number' || typeof b.limitEur !== 'number') throw new Error('invalid budget entry: windowDays and limitEur are required numbers');
    return {
      tenantId: typeof b.tenantId === 'string' ? b.tenantId : tenantId,
      windowDays: b.windowDays, limitEur: b.limitEur, hard: b.hard === true,
      ...(typeof b.workload === 'string' ? { workload: b.workload } : {}),
      ...(typeof b.maxCalls === 'number' ? { maxCalls: b.maxCalls } : {}),
    };
  });
}

/**
 * Wires the core engine for a CLI session: one SQLite store, one policy, one
 * tenant, one actor. Secrets come from the environment only.
 */
export interface RuntimeOptions {
  dbPath: string;
  tenantId: string;
  actor: string;
  policyPath: string;
  signingKeyPath?: string | undefined;
  verbose?: boolean;
  /** JSON array of Budget objects; falls back to EVIDENTIA_BUDGETS when omitted. See `parseBudgets`. */
  budgetsJson?: string | undefined;
}

export interface Runtime {
  options: RuntimeOptions;
  db: Database;
  ledger: AuditLedger;
  policy: PolicyDocument;
  registry: ModelRegistry;
  systems: AiSystemRegister;
  processing: ProcessingRegister;
  approvals: ApprovalService;
  meter: CostMeter;
  adapters: ProviderAdapter[];
  router: PolicyAwareRouter;
  store: KnowledgeStore;
  retriever: HybridRetriever;
  pipeline: ContentPipeline;
  observatory: Observatory;
  signingKey: SigningKeyPair | null;
  logger: Logger;
  ctx: { tenantId: string; actor: string };
}

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const DEFAULT_POLICY = resolve(REPO_ROOT, 'governance/policies/eu-default.yaml');

export function loadSigningKey(path: string | undefined, create: boolean): SigningKeyPair | null {
  if (!path) return null;
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')) as SigningKeyPair;
  if (!create) return null;
  const key = generateSigningKey();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(key, null, 2), { encoding: 'utf8', mode: 0o600 });
  return key;
}

export function createRuntime(options: RuntimeOptions): Runtime {
  if (options.dbPath !== ':memory:') mkdirSync(dirname(resolve(options.dbPath)), { recursive: true });
  const db = openDatabase({ path: options.dbPath });
  const logger = new Logger({ level: options.verbose ? 'debug' : 'warn', context: { component: 'cli', tenantId: options.tenantId } });
  const ledger = new AuditLedger(db);
  const policy = parsePolicy(readFileSync(options.policyPath, 'utf8'));
  const registry = new ModelRegistry(db, ledger);
  const systems = new AiSystemRegister(db, ledger);
  const processing = new ProcessingRegister(db, ledger);
  const approvals = new ApprovalService(db, ledger);
  const budgets = parseBudgets(options.budgetsJson ?? process.env['EVIDENTIA_BUDGETS'], options.tenantId);
  const meter = new CostMeter(db, {
    budgets,
    onBudgetExceeded: (b, spent) => {
      logger.warn('budget exceeded', { tenantId: b.tenantId, workload: b.workload ?? 'all', windowDays: b.windowDays, limitEur: b.limitEur, spentEur: spent, hard: b.hard });
      ledger.append({ tenantId: b.tenantId, actor: 'system', action: 'cost.budget_exceeded', objectType: 'tenant', objectId: b.tenantId, evidence: { workload: b.workload ?? null, windowDays: b.windowDays, limitEur: b.limitEur, spentEur: spent, hard: b.hard } });
    },
  });
  const secrets = envSecrets();
  // The offline, self-hosted embedding model is always available so that ingestion
  // works before any external provider is contracted. Registered once, audited.
  if (!registry.find(options.tenantId, 'local', 'hash-384')) {
    registry.upsert({ tenantId: options.tenantId, actor: 'system' }, {
      provider: 'local', model: 'hash-384', displayName: 'Local hashed embeddings (offline, non-semantic)', adapter: 'local', hosting: 'self-hosted', modalities: ['embedding'],
      dataPolicy: { retentionDays: 0, usedForTraining: false, dpaAvailable: true, zeroDataRetention: true }, allowedDataClasses: ['public', 'internal', 'confidential', 'personal', 'special-category'],
      approvalStatus: 'approved', evaluationStatus: 'passed', qualityTier: 1, latencyTier: 1, riskNotes: 'Deterministic feature hashing; no data leaves the host. Replace with a real embedding model for semantic retrieval.',
    });
  }
  const records = registry.list(options.tenantId).map((r) => r.record);
  const adapters = buildAdapters(records, secrets, { webSearch: true }).filter((a) => a.id !== 'demo');
  if (records.some((r) => r.provider === 'demo')) adapters.push(new DemoProvider('demo'));
  const router = new PolicyAwareRouter({ registry, policy, ledger, meter, adapters, logger });
  const ctx = { tenantId: options.tenantId, actor: options.actor };
  const store = new KnowledgeStore(db, ledger, {
    claimConfidenceThreshold: policy.confidenceThresholds.claimExtraction,
    embedder: async (texts) => {
      const r = await router.embed({ tenantId: options.tenantId, workload: 'index', dataClasses: ['internal'], need: 'embeddings', texts });
      return { vectors: r.vectors, model: `${r.provider}/${r.model}` };
    },
  });
  const retriever = new HybridRetriever(db);
  const signingKey = loadSigningKey(options.signingKeyPath, false);
  const pipeline = new ContentPipeline({ db, ledger, approvals, policy, adapters: [], ...(signingKey ? { signingKey } : {}), publisher: options.tenantId });
  const observatory = new Observatory(db, ledger, router);
  return { options, db, ledger, policy, registry, systems, processing, approvals, meter, adapters, router, store, retriever, pipeline, observatory, signingKey, logger, ctx };
}
