import { z } from 'zod';

/**
 * Governance vocabulary shared by policies, registers, the router and the UI.
 * Keep these enums small and explicit: every value appears in policy YAML files
 * that non-engineers (DPO, AI governance officer) must be able to read.
 */

export const DataClass = z.enum(['public', 'internal', 'confidential', 'personal', 'special-category']);
export type DataClass = z.infer<typeof DataClass>;

/** Ordering used to find the most sensitive class in a request. */
export const DATA_CLASS_RANK: Record<DataClass, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  personal: 3,
  'special-category': 4,
};

export const Hosting = z.enum(['eu', 'eea', 'uk', 'ch', 'us', 'global', 'self-hosted']);
export type Hosting = z.infer<typeof Hosting>;

export const ApprovalStatus = z.enum(['draft', 'approved', 'suspended', 'retired']);
export type ApprovalStatus = z.infer<typeof ApprovalStatus>;

export const EvaluationStatus = z.enum(['not-evaluated', 'in-progress', 'passed', 'failed']);

export const DeploymentRole = z.enum(['provider', 'deployer', 'provider-and-deployer']);

export const RiskClassification = z.enum(['minimal', 'limited', 'high', 'prohibited-screened-out']);

export const ModelDataPolicy = z.object({
  /** Provider-side retention of prompts/outputs in days; 0 = zero data retention. */
  retentionDays: z.number().int().min(0),
  usedForTraining: z.boolean(),
  dpaAvailable: z.boolean(),
  zeroDataRetention: z.boolean().default(false),
  subprocessors: z.array(z.string()).default([]),
  /** Where the provider states inference runs, if known. */
  processingRegion: z.string().optional(),
  /** Link or reference to the provider's data policy, for the evidence file. */
  policyReference: z.string().optional(),
});
export type ModelDataPolicy = z.infer<typeof ModelDataPolicy>;

export const ModelRecord = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  displayName: z.string().min(1),
  /** Adapter family used to talk to it. */
  adapter: z.enum(['anthropic', 'openai-compatible', 'google', 'fake', 'local']),
  endpoint: z.string().url().optional(),
  hosting: Hosting,
  release: z.string().optional(),
  retirement: z.string().optional(),
  contextWindow: z.number().int().positive().optional(),
  modalities: z.array(z.enum(['text', 'image', 'audio', 'embedding'])).default(['text']),
  dataPolicy: ModelDataPolicy,
  allowedDataClasses: z.array(DataClass).default(['public']),
  approvedUseCases: z.array(z.string()).default([]),
  approvalStatus: ApprovalStatus.default('draft'),
  evaluationStatus: EvaluationStatus.default('not-evaluated'),
  contractualStatus: z.string().optional(),
  riskNotes: z.string().optional(),
  cost: z
    .object({
      inputPerMillionTokensEur: z.number().min(0),
      outputPerMillionTokensEur: z.number().min(0),
      cachedInputPerMillionTokensEur: z.number().min(0).optional(),
    })
    .optional(),
  /** Relative quality/latency hints used only for ranking among policy-allowed models. */
  qualityTier: z.number().int().min(1).max(5).default(3),
  latencyTier: z.number().int().min(1).max(5).default(3),
});
export type ModelRecord = z.infer<typeof ModelRecord>;
export type ModelRecordInput = z.input<typeof ModelRecord>;

export const AiSystemRecord = z.object({
  name: z.string().min(1),
  capability: z.string().min(1),
  purpose: z.string().min(1),
  owner: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  version: z.string().default('1'),
  dataClasses: z.array(DataClass).min(1),
  jurisdiction: z.string().min(2),
  deploymentRole: DeploymentRole,
  riskClassification: RiskClassification,
  /** Free-text reasoning for the classification (Annex III screening). */
  riskReasoning: z.string().min(1),
  article50Applicable: z.boolean(),
  humanOversight: z.string().min(1),
  approvedUses: z.array(z.string()).default([]),
  prohibitedUses: z.array(z.string()).default([]),
  reviewDate: z.string(),
  evidence: z.array(z.object({ label: z.string(), reference: z.string() })).default([]),
  status: z.enum(['active', 'suspended', 'retired']).default('active'),
});
export type AiSystemRecord = z.infer<typeof AiSystemRecord>;
export type AiSystemRecordInput = z.input<typeof AiSystemRecord>;

/** GDPR Article 30-style record of processing activity kept per purpose. */
export const ProcessingRecord = z.object({
  purpose: z.string().min(1),
  legalBasis: z.enum(['consent', 'contract', 'legal-obligation', 'vital-interests', 'public-task', 'legitimate-interests']),
  legitimateInterestAssessment: z.string().optional(),
  role: z.enum(['controller', 'processor', 'joint-controller']),
  dataCategories: z.array(z.string()).min(1),
  dataSubjects: z.array(z.string()).min(1),
  recipients: z.array(z.string()).default([]),
  processors: z.array(z.object({ name: z.string(), role: z.string(), dpa: z.boolean(), location: z.string() })).default([]),
  internationalTransfers: z
    .array(z.object({ destination: z.string(), mechanism: z.string(), reference: z.string().optional() }))
    .default([]),
  retentionDays: z.number().int().positive(),
  securityMeasures: z.array(z.string()).default([]),
  dpiaRequired: z.boolean(),
  dpiaReference: z.string().optional(),
  dataResidency: z.string().optional(),
});
export type ProcessingRecord = z.infer<typeof ProcessingRecord>;
export type ProcessingRecordInput = z.input<typeof ProcessingRecord>;
