# Model governance

## Registry record (per model)

`ModelRecord` (packages/core/src/governance/schemas.ts): provider, model,
displayName, adapter, endpoint, hosting (eu/eea/uk/ch/us/global/self-hosted),
release/retirement, contextWindow, modalities, `dataPolicy` {retentionDays,
usedForTraining, dpaAvailable, zeroDataRetention, subprocessors,
processingRegion, policyReference}, allowedDataClasses, approvedUseCases,
approvalStatus (draft/approved/suspended/retired), evaluationStatus,
contractualStatus, riskNotes, cost, qualityTier, latencyTier.

## Lifecycle

1. **Register** (`evidentia model register --file`) as `draft` from the contract
   facts — never from marketing pages.
2. **Evaluate**: run drafting evals with the model (judged quality, cost,
   latency); record `evaluationStatus`.
3. **Approve** (`model status <id> approved --note "DPA ref"`) by an admin; audited.
4. **Operate**: the router only considers approved models allowed by policy for
   the request's data classes; every call metered.
5. **Suspend/retire** on incident, contract change or provider retirement;
   audited; drafts keep the model id for provenance.

## Routing

`PolicyAwareRouter.plan` filters by policy and capability, ranks by strategy
(quality, cost, latency, balanced), tries candidates in order (default 2
attempts), records each attempt. No candidate → `policy_denied` with reasons
(`model.call_denied` in the ledger). Hard budgets block before routing.

## Policy interactions

- Policy rules can only narrow; `allowedDataClasses` on the record is a ceiling.
- `never-train-on-confidential` deny rule wins even if other conditions pass.
- Personal data → zero-retention, EU/EEA/self-hosted; special category → self-hosted.

## Provider data policies (to verify per contract)

Record: inference region, log retention, training on inputs (opt-out status),
DPA/SCC availability, subprocessors, incident notification terms, API terms on
citation display (observatory). Store the reference in `policyReference`.

## Evaluation of models

Judged content-quality evaluation is optional and labelled; deterministic
verification is the gate. Compare models on unsupported-claim rate after
verification, placeholder rate, cost per accepted draft, latency.

## Cost

`CostMeter` records tokens (input/output/cached), duration, retries, status and
EUR cost from registry prices. Budgets per tenant/workload with soft alerts and
hard blocks. `evidentia cost --since`.
