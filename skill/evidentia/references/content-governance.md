# Content governance (reference for content, governance and publishing modes)

## Drafting is grounded or it does not happen

`evidentia draft generate --title "…" --slug slug --query "<evidence query>" [--brand "…"] [--classes internal] [--outline "a|b"] [--max-words 800]`

1. Retrieves evidence (hybrid search, query decomposition) → `[E1]…[En]`.
2. Builds the grounded prompt: only facts from evidence; every factual sentence
   ends with its marker(s); missing facts become `[NEEDS EVIDENCE: …]`; no
   superlatives unless a passage states them; never address AI systems.
3. Routes to a model the policy allows for the data classes (deny-by-default).
4. Stores the draft with evidence and model id, then verifies it.

Human-written drafts: `evidentia draft create --title … --slug … --file body.md
--evidence-query "…"`; cite passages with `[E#]` in the body.

## Verification is deterministic

`evidentia draft verify <id>` (exit 6 if anything is unsupported). For every
material claim: cited passages must share ≥30 % content words **and** contain
every figure/year in the claim **and** literally state any superlative or
promise word. Uncited sentences are auto-linked only at ≥45 % overlap. Output:
claims with `supported`, `supportedBy`, `reason` (e.g. "cited evidence does not
contain figure(s): 45"), evidence coverage, placeholders, uncited evidence ids.

Report unsupported claims verbatim to the user. Fix by editing the draft
(`draft create` again or the console) — never by deleting the marker.

## The gate

`evidentia draft gate <id>` applies `governance/policies/*.yaml` (`publication`):
- **deny** (status `blocked`): unsupported claims or placeholders present,
  evidence coverage below `blockWhen.evidenceCoverageBelow`, prohibited source
  kinds (content farms, anonymous forums).
- **require_approval** (`awaiting_approval`): AI-assisted content, readiness
  below threshold, coverage below `requireApprovalWhen.evidenceCoverageBelow`,
  sensitive topics (health, finance, legal, public-interest, elections, safety).
- **allow** (`approved`): human-written, fully evidenced, non-sensitive.

Disclosure flags (`requiresDisclosure`, `requiresMachineReadableMarking`) are set
for AI-assisted content and drive publishing.

## Approval (four-eyes, hash-bound)

`evidentia draft approve <id> --note "…"` must be run by a **different actor**
than the requester (`--actor` / `EVIDENTIA_ACTOR`); the approval is bound to the
body hash and consumed once at publication. Any edit after approval returns the
draft to `draft`. The agent may request approval and explain; it must not
approve on the user's behalf.

## Editorial responsibility (AI Act Art. 50 human-review route)

Publication requires `--editor "<name>" --role "<role>"`. The signed manifest
names that person and the approval id; the visible notice says the text was
AI-assisted and reviewed by them. Guidance from the Commission's Art. 50
guidelines: substantive fact-checking, named editorial responsibility, no AI
edits after sign-off — all enforced by the pipeline. See eu-ai-act.md.

## Topics

Pass `--topics health,finance` when the content touches regulated or
public-interest matters so the gate routes it to a human even if human-written.
