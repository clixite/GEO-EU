import { z } from 'zod';
import { parse as parseYaml } from 'yaml';
import { DATA_CLASS_RANK, DataClass, Hosting, ModelRecord } from './schemas.ts';
import { EvidentiaError } from '../shared/errors.ts';

/**
 * Machine-readable governance policies.
 *
 * Policies are YAML documents validated against `PolicyDocument`. They are small,
 * typed rule sets rather than a general rule language so that a DPO can read them
 * and an engineer can test them exhaustively. Model access is deny-by-default:
 * a model may process a request only if, for EVERY data class in the request, at
 * least one allow rule is satisfied and no deny rule matches.
 */

const ModelRequirement = z.object({
  approvalStatus: z.array(z.enum(['draft', 'approved', 'suspended', 'retired'])).optional(),
  usedForTraining: z.boolean().optional(),
  dpaAvailable: z.boolean().optional(),
  zeroDataRetention: z.boolean().optional(),
  maxRetentionDays: z.number().int().min(0).optional(),
  hosting: z.array(Hosting).optional(),
  providers: z.array(z.string()).optional(),
  adapters: z.array(z.enum(['anthropic', 'openai-compatible', 'google', 'fake', 'local'])).optional(),
});

const ModelAccessRule = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  dataClasses: z.array(DataClass).min(1),
  effect: z.enum(['allow', 'deny']),
  require: ModelRequirement.prefault({}),
});

export const PolicyDocument = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().optional(),
  jurisdiction: z.string().default('EU'),
  modelAccess: z
    .object({
      defaultEffect: z.literal('deny').default('deny'),
      rules: z.array(ModelAccessRule).default([]),
    })
    .prefault({}),
  publication: z
    .object({
      requireApprovalWhen: z
        .object({
          aiAssisted: z.boolean().default(true),
          readinessBelow: z.number().min(0).max(100).default(0),
          /** Require approval when no readiness analysis has been attached to the draft. */
          readinessUnknown: z.boolean().default(false),
          evidenceCoverageBelow: z.number().min(0).max(1).default(0),
          topics: z.array(z.string()).default([]),
          always: z.boolean().default(false),
        })
        .prefault({}),
      disclosure: z
        .object({
          requiredWhenAiAssisted: z.boolean().default(true),
          machineReadableMarking: z.boolean().default(true),
        })
        .prefault({}),
      blockWhen: z
        .object({
          unsupportedClaims: z.boolean().default(true),
          evidenceCoverageBelow: z.number().min(0).max(1).default(0),
          prohibitedSourceKinds: z.array(z.string()).default([]),
        })
        .prefault({}),
    })
    .prefault({}),
  retentionDays: z.record(z.string(), z.number().int().positive()).prefault({}),
  confidenceThresholds: z
    .object({
      claimExtraction: z.number().min(0).max(1).default(0.6),
      entityResolution: z.number().min(0).max(1).default(0.7),
    })
    .prefault({}),
});
export type PolicyDocument = z.infer<typeof PolicyDocument>;

export interface Decision {
  effect: 'allow' | 'deny' | 'require_approval';
  policyId: string;
  policyVersion: number;
  matchedRules: string[];
  reasons: string[];
}

export function parsePolicy(yamlText: string): PolicyDocument {
  const raw: unknown = parseYaml(yamlText);
  const result = PolicyDocument.safeParse(raw);
  if (!result.success) {
    throw new EvidentiaError('validation', 'invalid policy document', { issues: result.error.issues });
  }
  return result.data;
}

function requirementSatisfied(
  req: z.infer<typeof ModelRequirement>,
  model: ModelRecord,
  reasons: string[],
): boolean {
  let ok = true;
  const fail = (why: string) => {
    ok = false;
    reasons.push(why);
  };
  if (req.approvalStatus && !req.approvalStatus.includes(model.approvalStatus))
    fail(`model approval status is ${model.approvalStatus}`);
  if (req.usedForTraining !== undefined && model.dataPolicy.usedForTraining !== req.usedForTraining)
    fail(`provider training usage is ${model.dataPolicy.usedForTraining}`);
  if (req.dpaAvailable !== undefined && model.dataPolicy.dpaAvailable !== req.dpaAvailable)
    fail(`DPA availability is ${model.dataPolicy.dpaAvailable}`);
  if (req.zeroDataRetention !== undefined && model.dataPolicy.zeroDataRetention !== req.zeroDataRetention)
    fail(`zero data retention is ${model.dataPolicy.zeroDataRetention}`);
  if (req.maxRetentionDays !== undefined && model.dataPolicy.retentionDays > req.maxRetentionDays)
    fail(`provider retention ${model.dataPolicy.retentionDays}d exceeds ${req.maxRetentionDays}d`);
  if (req.hosting && !req.hosting.includes(model.hosting)) fail(`hosting ${model.hosting} not in ${req.hosting.join('/')}`);
  if (req.providers && !req.providers.includes(model.provider)) fail(`provider ${model.provider} not allowed`);
  if (req.adapters && !req.adapters.includes(model.adapter)) fail(`adapter ${model.adapter} not allowed`);
  return ok;
}

/**
 * Decide whether `model` may process a request carrying `dataClasses`.
 * The model's own `allowedDataClasses` is an additional ceiling: a policy can
 * never widen what the registry entry allows.
 */
export function evaluateModelAccess(
  policy: PolicyDocument,
  model: ModelRecord,
  dataClasses: readonly DataClass[],
): Decision {
  const reasons: string[] = [];
  const matched: string[] = [];
  const classes = [...new Set(dataClasses)].sort((a, b) => DATA_CLASS_RANK[b] - DATA_CLASS_RANK[a]);
  if (classes.length === 0) classes.push('public');

  for (const cls of classes) {
    if (!model.allowedDataClasses.includes(cls)) {
      reasons.push(`registry entry for ${model.provider}/${model.model} does not allow data class "${cls}"`);
      return deny(policy, matched, reasons);
    }
    const rules = policy.modelAccess.rules.filter((r) => r.dataClasses.includes(cls));
    for (const r of rules.filter((r) => r.effect === 'deny')) {
      if (requirementSatisfied(r.require, model, [])) {
        matched.push(r.id);
        reasons.push(`deny rule "${r.id}" matches for data class "${cls}"`);
        return deny(policy, matched, reasons);
      }
    }
    const allowRules = rules.filter((r) => r.effect === 'allow');
    let allowed = false;
    const localReasons: string[] = [];
    for (const r of allowRules) {
      if (requirementSatisfied(r.require, model, localReasons)) {
        allowed = true;
        matched.push(r.id);
        break;
      }
    }
    if (!allowed) {
      reasons.push(
        allowRules.length === 0
          ? `no allow rule covers data class "${cls}" (default deny)`
          : `no allow rule satisfied for data class "${cls}": ${localReasons.join('; ')}`,
      );
      return deny(policy, matched, reasons);
    }
  }
  return { effect: 'allow', policyId: policy.id, policyVersion: policy.version, matchedRules: matched, reasons };
}

function deny(policy: PolicyDocument, matchedRules: string[], reasons: string[]): Decision {
  return { effect: 'deny', policyId: policy.id, policyVersion: policy.version, matchedRules, reasons };
}

export interface PublicationFacts {
  aiAssisted: boolean;
  /** null when no readiness analysis has been attached to the draft. */
  readinessScore: number | null;
  /** Share of material factual claims backed by evidence, 0..1. */
  evidenceCoverage: number;
  unsupportedClaims: number;
  topics: readonly string[];
  sourceKinds: readonly string[];
}

export interface PublicationDecision extends Decision {
  requiresDisclosure: boolean;
  requiresMachineReadableMarking: boolean;
  blockers: string[];
  /** Non-blocking observations (e.g. readiness not assessed). */
  warnings: string[];
}

/** Publication gate: may block, require human approval, or allow. */
export function evaluatePublication(policy: PolicyDocument, facts: PublicationFacts): PublicationDecision {
  const p = policy.publication;
  const blockers: string[] = [];
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (p.blockWhen.unsupportedClaims && facts.unsupportedClaims > 0)
    blockers.push(`${facts.unsupportedClaims} unsupported factual claim(s)`);
  if (facts.evidenceCoverage < p.blockWhen.evidenceCoverageBelow)
    blockers.push(`evidence coverage ${facts.evidenceCoverage.toFixed(2)} below ${p.blockWhen.evidenceCoverageBelow}`);
  const badSources = facts.sourceKinds.filter((k) => p.blockWhen.prohibitedSourceKinds.includes(k));
  if (badSources.length) blockers.push(`prohibited source kind(s): ${badSources.join(', ')}`);

  const requiresDisclosure = facts.aiAssisted && p.disclosure.requiredWhenAiAssisted;
  const requiresMachineReadableMarking = requiresDisclosure && p.disclosure.machineReadableMarking;

  let effect: Decision['effect'] = 'allow';
  if (blockers.length) {
    effect = 'deny';
    reasons.push(...blockers);
  } else {
    const r = p.requireApprovalWhen;
    if (r.always) reasons.push('policy requires approval for all publications');
    if (r.aiAssisted && facts.aiAssisted) reasons.push('AI-assisted content requires human approval');
    if (facts.readinessScore === null) {
      if (r.readinessUnknown) reasons.push('readiness not assessed (policy requires an assessment before publication)');
      else warnings.push('readiness not assessed; readiness threshold not applied');
    } else if (facts.readinessScore < r.readinessBelow) reasons.push(`readiness ${facts.readinessScore} below ${r.readinessBelow}`);
    if (facts.evidenceCoverage < r.evidenceCoverageBelow)
      reasons.push(`evidence coverage ${facts.evidenceCoverage.toFixed(2)} below ${r.evidenceCoverageBelow}`);
    const sensitive = facts.topics.filter((t) => r.topics.includes(t));
    if (sensitive.length) reasons.push(`sensitive topic(s): ${sensitive.join(', ')}`);
    if (reasons.length) effect = 'require_approval';
  }
  return {
    effect,
    policyId: policy.id,
    policyVersion: policy.version,
    matchedRules: [],
    reasons,
    requiresDisclosure,
    requiresMachineReadableMarking,
    blockers,
    warnings,
  };
}

export function retentionDaysFor(policy: PolicyDocument, objectType: string, fallback = 365): number {
  return policy.retentionDays[objectType] ?? fallback;
}
