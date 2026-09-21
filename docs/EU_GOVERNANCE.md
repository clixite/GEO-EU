# EU Governance & Privacy Engineering Analysis — Enterprise GEO Platform (Clixite SRL)

- Research date / access date for all sources: 2026-09-18
- Product under analysis: enterprise Generative Engine Optimization (GEO) platform. Ingests the customer organisation's own documents and web pages; extracts claims/entities; generates evidence-grounded draft content with LLMs from multiple providers; gates publication behind human approval; publishes to websites; measures brand visibility by querying AI answer engines through official APIs. Built by Clixite SRL (Belgium). Sold to European organisations. Deployment: self-hosted by the customer OR operated by Clixite (SaaS).
- Verdict vocabulary (exactly one per framework): `applicable` / `potentially-applicable` / `customer-specific` / `non-applicable` / `not-yet-applicable` / `requires-legal-assessment`.
- Source register: `sources.yaml` (same folder). Source IDs in brackets, e.g. [AIA-REG].
- Status: COMPLETE (2026-09-18).

## 0. Executive verdict table

| # | Framework | Verdict | One-line reason | Hard dates that bind now |
|---|---|---|---|---|
| A | AI Act (Reg. 2024/1689 as amended by Reg. 2026/1744) | **applicable** — provider (Art. 50(2)) + customer deployer (Art. 50(4), Art. 4); **not high-risk**; GPAI duties non-applicable | Generative AI system placed on the market under Clixite's name; output is published content, so the B2B marking exemption fails | Art. 4 since 2 Feb 2025; Art. 50 since 2 Aug 2026 (grace to 2 Dec 2026 only for systems on the market before 2 Aug 2026); CoP interoperability signpost by 2 Feb 2027; Annex III high-risk deferred to 2 Dec 2027 (irrelevant unless repurposed for elections) |
| B | GDPR | **applicable** — Clixite processor (SaaS) / vendor (self-hosted); customer controller | Ingested corporate content contains personal data; LLM/answer-engine providers are sub-processors with US transfers | DPF valid (GC judgment 3 Sept 2025; appeal C-703/25 P pending); EDPB GL 03/2026 (scraping) and anonymisation drafts in consultation until 30 Oct 2026 |
| C | Copyright (DSM 2019/790, InfoSoc 2001/29, AI Act Art. 53(1)(c)) | **applicable** for TDM/quotation/press-publisher rules; **requires-legal-assessment** for rights in AI-assisted outputs | Third-party evidence fetching = Art. 4 TDM subject to lawful access and opt-out; outputs unprotected unless human creative contribution | C-250/25 Like Company: AG opinion scheduled 3 Sept 2026, judgment pending; Commission copyright review launched 18 May 2026 |
| D | Cyber Resilience Act (Reg. 2024/2847) | **applicable** (self-hosted product; Clixite = manufacturer); **potentially-applicable** (SaaS only via RDPS); essential requirements **not-yet-applicable** until 11 Dec 2027 | Commercially supplied software is a product with digital elements | **Art. 14 reporting live since 11 Sept 2026** (ENISA SRP); full application 11 Dec 2027 |
| E | NIS2 (Dir. 2022/2555; BE law 26 Apr 2024) | **customer-specific**; Clixite's own status **requires-legal-assessment** | Customers flow down Art. 21(2)(d) supply-chain requirements; CCB recommends CyFun Basic for suppliers | BE law in force 18 Oct 2024; registration deadline 18 Mar 2025 (customers) |
| F | ePrivacy Art. 5(3) (+ EDPB GL 2/2023, APD checklist) | **applicable** to any client-side measurement Clixite injects; **customer-specific** for customer sites; consent-free analytics **not available in Belgium** | Pixels/JS/IP tracking in scope regardless of personal data; visitor counting not strictly necessary per APD | GDPR Art. 88a (audience measurement carve-out) is only a Nov 2025 proposal — not-yet-applicable |
| G | DSA (Reg. 2022/2065) | **potentially-applicable** at hosting-service tier for SaaS; **non-applicable** as online platform / for self-hosted | Clixite stores customer content but does not disseminate it to the public | Applicable since 17 Feb 2024 |
| H | Accessibility (EAA 2019/882; WAD 2016/2102; EN 301 549; WCAG 2.2) | **customer-specific** (e-commerce/consumer sites and public-sector customers); console itself **non-applicable** under EAA | B2B enterprise software not listed in EAA Art. 2; published content inherits the customer's duties | EAA since 28 Jun 2025; EN 301 549 V4.1.1 (Sept 2026, WCAG 2.2) not yet cited in OJ; v3.2.1 remains harmonised |
| I | Data Act (Reg. 2023/2854) Ch. VI | **applicable** to Clixite-operated SaaS; **non-applicable** self-hosted | SaaS = data processing service; switching/export/open-interface duties | Since 12 Sept 2025; switching charges zero from 12 Jan 2027 |
| J | Provenance (C2PA 2.4, IPTC DST, CoP) | **applicable** as the technical route for Art. 50; no standard mandated | CoP requires signed metadata + watermark layers; C2PA not named | C2PA 2.4 (Apr 2026); CoP Measure 3.4 interoperability by 2 Feb 2027 |

### Top-10 engineering backlog derived from the verdicts

1. Art. 50(2) marking + logging + detection endpoint (A, J) — due at placing on the market (or 2 Dec 2026 if already on the market).
2. Editorial-control workflow with named editorial responsibility and post-approval AI lock (A).
3. Public-interest claim classifier + EU icon injection (A).
4. ENISA SRP registration and 24 h/72 h/14 d vulnerability runbook (D) — overdue if the self-hosted product is on the market.
5. SBOM per release, signed updates, secure-by-default install, support-period statement (D, E).
6. DPA + sub-processor register + transfer register (DPF/SCC/TIA) + DPIA template (B).
7. PII detection/pseudonymisation before LLM calls; rights tooling across derived artefacts (B).
8. Robots/TDM-reservation/opt-out engine and quotation guardrails for third-party evidence (B, C).
9. Tenant export API + Data Act contract clauses; zero switching fees by 12 Jan 2027 (I).
10. WCAG 2.2 AA console + output accessibility linter; no client-side beacons by default (H, F).


## Method and evidence caveats

- All positions below were checked against primary/official sources on 2026-09-18 (Commission AI Act Service Desk, digital-strategy.ec.europa.eu, EDPB, ENISA, curia, ETSI, C2PA, IPTC, Belgian APD/GBA). Law-firm material was used only to locate primary documents.
- EUR-Lex was unreachable from this environment during the session (AWS WAF "challenge" response on every URL form via three different fetchers). Statutory article references are therefore given by their stable article numbering and the EUR-Lex ELI URL, and wording is paraphrased unless quoted from an official page that reproduces the text (the AI Act Service Desk reproduces the AI Act verbatim). Entries in `sources.yaml` carry a note where the EUR-Lex text itself could not be re-read in-session.
- CCB pages (ccb.belgium.be, atwork.safeonweb.be) returned HTTP 403 to all fetchers; facts about the Belgian NIS2 law are taken from the CCB page as surfaced by the search index and cross-checked against the Directive. Flagged accordingly.
- This is engineering/product planning material, not legal advice; verdicts marked `requires-legal-assessment` need counsel.

## Product facts assumed for the verdicts

1. Clixite SRL (Belgium) places the platform on the EU market under its own name, in two modes: (a) self-hosted software delivered to the customer; (b) SaaS operated by Clixite.
2. The platform ingests the customer organisation's own documents and web pages (first-party content); it may fetch third-party pages referenced as evidence.
3. It extracts claims/entities; generates draft content with third-party LLMs (multiple providers, via API); gates publication behind human approval; publishes to the customer's website; queries AI answer engines through official APIs to measure brand visibility.
4. Clixite does not train or substantially fine-tune foundation models.
5. Content produced is marketing/corporate web content: product descriptions, thought-leadership articles, FAQs, factual claims (some potentially on health, safety, sustainability or financial matters depending on the customer).

---

## A. EU AI Act — Regulation (EU) 2024/1689, as amended by Regulation (EU) 2026/1744 ("Digital Omnibus on AI")

**Verdict: applicable** (Clixite as *provider* of a generative AI system under Art. 50(2); customer as *deployer* under Art. 50(4) and Art. 4). **Not high-risk** (Annex III screening below). GPAI-model provider obligations: **non-applicable** to Clixite.

### A.1 Entry into force and staged application — CURRENT dates (post-Omnibus)

| Provision | Date | Source |
|---|---|---|
| Entry into force | 1 August 2024 (20 days after OJ L publication of 12 July 2024) | [AIA-REG], Art. 113 [AIA-SD-ART113] |
| Chapters I–II (definitions, Art. 4 AI literacy, Art. 5 prohibited practices) | 2 February 2025 | Art. 113(a) [AIA-SD-ART113]; [EC-AI-TIMELINE] |
| GPAI-model obligations (Chapter V), governance, penalties (except Art. 101) | 2 August 2025 | Art. 113(b) [AIA-SD-ART113]; [EC-GPAI-GL] |
| Art. 50 transparency obligations (general application date) | 2 August 2026 — **unchanged by the Omnibus** | [EC-ART50-GL] para 153; [EC-AI-TIMELINE]; [COUNCIL-OMNIBUS-PR] |
| Grace period for Art. 50(2) marking, only for generative systems placed on the market / put into service **before 2 Aug 2026** | until **2 December 2026** (Omnibus cut the proposed 6-month grace to 3 months) | [COUNCIL-OMNIBUS-PR]; [EC-ART50-GL] para 153; [EC-ART50-QUICKFACTS] |
| Annex III stand-alone high-risk systems | **2 December 2027** (was 2 Aug 2026) | [OMNIBUS-AI-REG]; [COUNCIL-OMNIBUS-PR]; [EC-AI-TIMELINE] |
| Annex I product-embedded high-risk systems (Art. 6(1)) | **2 August 2028** (was 2 Aug 2027) | [OMNIBUS-AI-REG]; [COUNCIL-OMNIBUS-PR]; [EC-AI-TIMELINE] |
| National AI regulatory sandboxes | postponed to 2 August 2027 | [COUNCIL-OMNIBUS-PR] |
| Enforcement of Art. 4 AI literacy by national market-surveillance authorities | from 3 August 2026 | [EC-AILIT-FAQ] |

Digital Omnibus on AI — status as of 2026-09-18: **adopted and in force.** Commission proposal 17 Nov 2025; provisional agreement 6 May 2026; Parliament plenary 16 June 2026; Council final adoption 29 June 2026; act dated 8 July 2026; published OJ 24 July 2026 as Regulation (EU) 2026/1744; entered into force 27 July 2026 [OMNIBUS-AI-REG], [COUNCIL-OMNIBUS-PR]. Other changes relevant here: Art. 4 reworded (the "sufficient level" wording removed, emphasis shifted to Commission/Member-State support; the core obligation for providers/deployers to take AI-literacy measures remains) [EC-AILIT-FAQ]; a new prohibited practice on AI generation of non-consensual intimate imagery/CSAM (applies December 2026) [COUNCIL-OMNIBUS-PR]; the AI Act Service Desk still displays pre-Omnibus wording for Arts. 4, 6, 99, 113 with a banner "amended by the Digital Omnibus on AI… text not yet updated" [AIA-SD-ART113], [AIA-SD-ART4], [AIA-SD-ART6], [AIA-SD-ART99].

Note: the "Digital Omnibus" on data (GDPR/ePrivacy, incl. proposed GDPR Art. 88a on terminal-equipment access) is a **separate proposal still in the ordinary legislative procedure** — see Section F.

### A.2 Provider vs deployer (Art. 3(3), 3(4)) applied to this product

- Art. 3(3) "provider": a natural or legal person… that develops an AI system or a GPAI model or that has one developed and places it on the market or puts it into service under its own name or trademark, whether for payment or free of charge [AIA-SD-ART3].
- Art. 3(4) "deployer": a natural or legal person… using an AI system under its authority, except in a personal non-professional activity [AIA-SD-ART3].
- Commission Guidelines on Art. 50 (C(2026) 5054 final, 20 July 2026), para 11 and example: "a company provides a generative or interactive AI application (e.g. a chatbot, image generator, AI agent) on the Union market under its own name or trademark to consumers, professional users or other legal entities… The company is a provider responsible for compliance with the transparency obligations in Article 50(1) and/or (2)… regardless of whether the AI system is provided for free or for payment" [EC-ART50-GL].
- Para 74: providers "may rely on the marking solution implemented by an upstream model provider or a third party… to the extent that the marking solution is compliant… without prejudice to the responsibility of the provider of the AI system" [EC-ART50-GL].
- Para 12: deployer "authority" = responsibility for the decision to deploy and how outputs are used; technical control not required. Para 14: employees/contractors of the deployer are not separate deployers. Para 16: hosting providers/platforms that only disseminate third-party AI content are **not** deployers [EC-ART50-GL].

Consequence: **Clixite = provider** of a generative AI system (the platform generates text; it is placed on the market under Clixite's name, in both self-hosted and SaaS modes). **Customer = deployer** (decides to deploy, decides what to publish). Using third-party LLMs via API does not shift provider status away from Clixite; Clixite may *technically* rely on the model provider's marking (e.g., model-level text watermark) but remains accountable.

### A.3 Is a GEO content tool high-risk? Annex III screening

Annex III areas [AIA-SD-ANNEX3]: (1) biometrics; (2) critical infrastructure; (3) education/vocational training; (4) employment/workers management; (5) access to essential private and public services (credit, insurance, benefits, emergency); (6) law enforcement; (7) migration/asylum/border; (8) administration of justice and democratic processes, incl. 8(b) "AI systems intended to be used for influencing the outcome of an election or referendum or the voting behaviour of natural persons in the exercise of their vote in elections or referenda".

Reasoning:
- The intended purpose (corporate/marketing content optimisation for AI answer engines) matches none of areas 1–7.
- 8(b) is the only plausible hit and only if the tool were *intended* to be used for political campaigning/voter influence. Intended purpose is defined by the provider (Art. 3(12)). Mitigation: exclude electoral/political-campaign use in the intended purpose and terms; add an acceptable-use control.
- Art. 5 prohibited practices: not engaged (no subliminal/manipulative techniques exploiting vulnerabilities, no social scoring, no biometric/emotion inference).
- Art. 6(3) derogations would be available in doubtful cases (narrow procedural task / preparatory task), with a documented assessment under Art. 6(4) [AIA-SD-ART6] — not needed because the system is outside Annex III to begin with.
- Consequently: Chapter III (risk management, data governance, technical documentation, Art. 12 logging, human oversight, conformity assessment, EU database registration) does not apply **as a legal obligation**.

Residual risk: a customer could repurpose the tool for a political party's election messaging. That would make the *customer's* use a potential Annex III 8(b) deployment (from 2 Dec 2027) and could make the customer a provider of a new system if it changes the intended purpose (Art. 25). Contractual and product controls below.

### A.4 Art. 50 obligations — what exactly applies

Text of Art. 50 (verbatim on [AIA-SD-ART50]) and Commission interpretation [EC-ART50-GL]:

1. **Art. 50(2) — provider marking and detection (Clixite).** Providers of AI systems generating synthetic audio, image, video *or text* shall ensure outputs are marked in a machine-readable format and detectable as artificially generated or manipulated; solutions must be effective, interoperable, robust and reliable as far as technically feasible. Exceptions: assistive/editing functions that do not substantially alter input; systems authorised by law for criminal-offence purposes.
   - Guidelines para 73: techniques include watermarks, metadata identifications, cryptographic provenance methods, logging, fingerprints, or combinations; a full provenance chain is *not* required.
   - Para 76: detection must rely on publicly available industry-standard solutions where available; proprietary detection tolerated "limited in time" until standards emerge.
   - Paras 86–87: single "less robust metadata" marking suffices only for closed embedded systems; the **B2B/industrial exemption requires cumulatively** that output is strictly technical, perceived only by a limited pre-defined set of professionals, and **not intended to be shared outside the company**. A GEO platform whose purpose is publication **does not meet** that exemption.
   - Code of Practice on Transparency of AI-generated Content (10 June 2026), Section 1 Measure 1.1: multi-layer marking (digitally signed metadata + imperceptible watermark) for audio/image/video and *containerised text*; "given that free-form text cannot transport metadata, a single-layer of marking as described in Sub-measure 1.1.2 [watermarking] is considered sufficient" for free-form text; watermarking still to be applied for free-form text longer than 200 tokens; logging is an optional third layer and "direct logging may be appropriate for text content" (Sub-measure 1.1.3) [EC-COP-TRANSPARENCY].
   - Measure 3.4: interoperability staged — established metadata standards at entry into application; an interoperable detection access method or signpost by **2 February 2027** [EC-COP-TRANSPARENCY].
   - Timing for Clixite: if the platform was placed on the market before 2 Aug 2026 → conformity by 2 Dec 2026; if placed on the market on/after 2 Aug 2026 → at placing on the market [EC-ART50-GL] para 153.

2. **Art. 50(4), second subparagraph — deployer disclosure for published text (customer).** Deployers of AI systems generating/manipulating text "published with the purpose of informing the public on matters of public interest" must disclose the artificial origin, *unless* (a) authorised by law for criminal-offence purposes, or (b) "the AI-generated content has undergone a process of human review or editorial control and where a natural or legal person holds editorial responsibility for the publication of the content".
   - Guidelines para 131: "published" = accessible to an indeterminate, fairly large number of readers; "informing the public" = communicates knowledge, opinions or facts; "matters of public interest" = politics, public administration, justice, fundamental rights, public security, public health, environment, consumer safety, "and any economic, financial, political, scientific, or cultural development that may be relevant subject of public debate".
   - Guidelines examples **outside** scope: "AI-manipulated text that is part of a company's advertisement or product descriptions (not including any claims related to e.g. health, consumer safety or sustainability)"; a chatbot answer visible only to the prompting user. **Inside** scope: AI-generated summaries on a newspaper site; health-related lifestyle articles; "AI-manipulated corporate reports published on a listed company's website containing investor information"; public-safety messages [EC-ART50-GL] section 6.2.1.
   - Human review / editorial control (paras 134–136): "deliberate examination of the substance of the content by one or more natural persons possessing relevant knowledge"; "fact-checking the accuracy of the content is a minimum requirement"; spell-check, "the mere existence of an editorial policy, automated review processes or cursory editorial approval" do **not** qualify; **any substantive AI intervention after sign-off voids the exception**.
   - Editorial responsibility (para 138): a named legal/natural person or function holds ultimate legal responsibility; identity and contact details should be publicly findable (site legal notice / colophon).
   - Code of Practice Section 2, Commitment 4: non-media signatories "commit to establish, adapt, or maintain appropriate policies for human review or editorial control prior to publication", identify the person with editorial responsibility (name, role, contact), describe organisational measures; no need to document each individual review [EC-COP-TRANSPARENCY].
   - Where the exception is not met: disclosure via the **EU icon** ("AI GENERATED" / "AI MODIFIED") or an equivalent label, at first exposure, accessible (Section 2, Commitment 1, Measures 1.1–1.2, Annex 1) [EC-COP-TRANSPARENCY].

3. **Deep fakes (Art. 50(4) first subparagraph; Art. 3(60)).** Only image/audio/video resembling real persons/objects/places/events that would falsely appear authentic. Relevant only if the platform generates imagery of real products/people; product-in-AI-background examples are discussed in Guidelines section 5 [EC-ART50-GL].

4. **Art. 50(1)** (inform persons interacting with an AI system): relevant only if the platform exposes a chat interface to end users; internal professional users who obviously interact with an AI editor fall under the "obvious to a reasonably well-informed person" exception.

5. **Art. 50(5)**: information at first exposure, clear and distinguishable, meeting accessibility requirements — the Code references EN 301 549 / WCAG for label accessibility [EC-COP-TRANSPARENCY].

6. **Art. 50(7)**: the Commission and AI Board assessed the Code as adequate; ~190 signatories by end July 2026 (95 for Section 1, 192 for Section 2); signature remained possible after 27 July 2026 [EC-COP-BACKING], [EC-COP-SIGN-FAQ].

### A.5 Other AI Act provisions

- **Art. 4 AI literacy** — applies to all providers and deployers of any AI system since 2 Feb 2025; no certificate mandated; document training/measures; national enforcement from 3 Aug 2026; the Omnibus softened wording but kept the obligation [EC-AILIT-FAQ], [AIA-SD-ART4].
- **GPAI (Arts. 51–56)** — obligations bind *model* providers (documentation, downstream information, copyright policy incl. respect of Art. 4(3) DSM reservations, public training-content summary) [AIA-SD-ART53]. Commission Guidelines (18 July 2025): indicative 10^23 FLOP threshold; a downstream modifier becomes a model provider only if modification compute exceeds one third of the original; Commission enforcement powers from 2 Aug 2026; grandfathering of pre-2 Aug 2025 models until 2 Aug 2027 [EC-GPAI-GL]. Clixite calls models via API and does not fine-tune above that threshold → not a GPAI provider. The GPAI Code of Practice (10 July 2025) Copyright chapter commits signatories to respect robots.txt and machine-readable opt-outs, not to circumvent paywalls, and to mitigate infringing outputs; signatories include Amazon, Anthropic, Google, Microsoft, OpenAI, Mistral [EC-GPAI-COP] — relevant to model selection and to what documentation Clixite can expect under Art. 53(1)(b).
- **Art. 12 logging** — high-risk systems only ("High-risk AI systems shall technically allow for the automatic recording of events (logs) over the lifetime of the system") [AIA-SD-ART12]; **non-applicable** as a legal duty here, but the same design (event logs, model/version, prompt/response identifiers) is the cheapest way to satisfy Art. 50(2) logging (CoP sub-measure 1.1.3), GDPR accountability, and CRA vulnerability handling.
- **Art. 26 deployer duties** — high-risk only [AIA-SD-ART26]; non-applicable.
- **Penalties (Art. 99)** — Art. 5 breaches: up to EUR 35 m or 7 % worldwide turnover; Art. 50 and most other obligations: up to **EUR 15 m or 3 %**; incorrect information to authorities: EUR 7.5 m or 1 %; for SMEs the *lower* of the amount or percentage applies [AIA-SD-ART99]; Commission quick facts confirm the EUR 15 m / 3 % bracket for transparency breaches [EC-ART50-QUICKFACTS].

### A.6 Concrete product controls (AI Act)

1. **Marking pipeline (Art. 50(2))**: (a) prefer LLM providers offering model-level text watermarking with a public detection route, and record which provider/model produced each draft; (b) for exported/containerised outputs (HTML, DOCX, PDF, images) write digitally signed metadata; (c) keep an immutable generation log (hash of output, model, timestamp, prompt id) as the logging layer; (d) publish a "how to detect" page/API; (e) implement the interoperability signpost by 2 Feb 2027.
2. **Editorial-control mode (Art. 50(4) exception)**: approval gate captures reviewer identity, a substantive-review attestation (fact-check checklist tied to the evidence graph), and the named editorial-responsible person per customer/site; block AI regeneration after approval (re-approval required); expose a per-site legal-notice snippet listing editorial responsibility.
3. **Public-interest classifier**: flag drafts containing health, safety, sustainability, financial/investor or political claims; when flagged and not substantively reviewed, inject the EU icon/label and machine-readable disclosure.
4. **Intended-purpose statement and AUP**: exclude electoral/political campaigning and Annex III uses; make it a contractual condition.
5. **AI-literacy kit**: role-based in-product guidance plus a downloadable training-record template for customers (Art. 4).
6. **Model registry**: store upstream provider documentation (Art. 53(1)(b) information, watermark/detection capabilities, data residency, DPA terms).
7. **Sign the Code of Practice** (Section 1 as provider; encourage customers to sign Section 2) — reduces supervisory information requests [EC-COP-SIGN-FAQ].

### A.7 Claims we must NOT make (AI Act)

- "The platform is AI-Act-compliant / AI-Act-certified." (No certification scheme exists for Art. 50; the Code is voluntary and adherence "does not constitute conclusive evidence of compliance" — CoP Section 2 objectives.)
- "The AI Act does not apply because we only use third-party models." (Clixite is the provider of the generative AI *system*.)
- "Human approval removes all transparency obligations." (Only the Art. 50(4) deployer disclosure can be lifted, and only with substantive review plus editorial responsibility; Art. 50(2) provider marking still applies.)
- "Marketing content is never in scope of Art. 50(4)." (Health/safety/sustainability/investor claims are in scope per the Guidelines.)
- "Our tool is not high-risk, so no obligations apply." (Art. 4 and Art. 50 apply regardless.)
- "Outputs are watermarked" unless the chosen model actually applies a watermark and a detection route exists.
- Any statement that the high-risk delay to 2 Dec 2027 affects Art. 50 timing (it does not).

## B. GDPR — Regulation (EU) 2016/679 (+ Belgian framework law of 30 July 2018)

**Verdict: applicable** — in SaaS mode Clixite is a **processor** (Art. 4(8), Art. 28) for customer content and a **controller** for its own account/telemetry data; in self-hosted mode Clixite is a software vendor outside the controller/processor chain for customer data (unless it holds support access, in which case processor for that access); the customer is the **controller** (Art. 4(7)); LLM API providers and answer-engine providers are **sub-processors** (or independent controllers, depending on their terms).

### B.1 Why personal data is in scope even for "corporate content"

Ingested documents and web pages routinely contain personal data: author names and bios, employee names in case studies, customer testimonials, executives quoted in press releases, contact details, images. Extracted "entities" will include natural persons. Prompts sent to LLM APIs and answer engines can contain names of people (e.g., "who is the CEO of X"). The EDPB reminds that publicly available personal data remains personal data and that its availability online is not consent [EDPB-GL-3-2026] paras 44–45; [EDPB-OP-28-2024] paras 93–94.

### B.2 Roles and Art. 28 contract

- Art. 28(1): the controller uses only processors providing sufficient guarantees; Art. 28(3): a binding contract covering subject-matter/duration/nature/purpose, documented instructions, confidentiality, Art. 32 security, sub-processor authorisation (28(2), 28(4) flow-down), assistance with data-subject rights and Arts. 32–36, deletion/return at end of service, audit information [GDPR] (text not re-read in-session; article numbering stable).
- The Belgian APD brochure on AI systems (Sept 2024, updated Dec 2024) targets "controllers and processors involved in the development and deployment of AI systems" and maps GDPR accountability tools (ROPA, DPIA, TOMs, DPO) onto the AI Act's provider/deployer roles [APD-AI-BROCHURE].
- Practical mapping: **SaaS** — Clixite = processor; DPA with Annex of sub-processors (each LLM provider, each answer-engine API, hosting). **Self-hosted** — no DPA needed for customer data, but a DPA is needed if Clixite receives logs/telemetry/support dumps containing personal data.

### B.3 Art. 30 records

Both Clixite (as processor, Art. 30(2), and as controller for its own data, Art. 30(1)) and customers must keep records. The Art. 30(5) derogation for organisations under 250 employees does **not** apply where processing is not occasional — a content platform's processing is continuous, so keep the records regardless [GDPR].

### B.4 DPIA (Art. 35) — does LLM processing typically trigger one?

- Art. 35(1): a DPIA is required where processing, "in particular using new technologies", is likely to result in a high risk; Art. 35(3) lists mandatory cases (systematic and extensive evaluation/profiling with legal or similar effects; large-scale special-category data; large-scale systematic monitoring of public areas) [GDPR].
- WP29 Guidelines WP248 rev.01 (4 Oct 2017; endorsed by the EDPB 25 May 2018) list nine criteria; as a rule of thumb, processing meeting **two** criteria requires a DPIA: (1) evaluation or scoring; (2) automated decision-making with legal or similar significant effect; (3) systematic monitoring; (4) sensitive or highly personal data; (5) large-scale processing; (6) matching or combining datasets; (7) data concerning vulnerable data subjects; (8) innovative use or applying new technological or organisational solutions; (9) processing that prevents data subjects from exercising a right or using a service [WP29-WP248].
- Applied to this product: criterion (8) "innovative use / new technology" is met by design (LLM processing; the Belgian APD brochure states DPIAs "are mandatory when processing high-risk data or implementing new technologies" [APD-AI-BROCHURE]); criterion (6) "matching or combining datasets" is met when documents from multiple internal systems are consolidated into an entity/claim graph; criterion (5) can be met for large organisations. **Conclusion: a DPIA will typically be required for the customer's deployment**, and the EDPB's Opinion 28/2024 notes that supervisory authorities consider AI models "very likely to require" a thorough identification-risk evaluation [EDPB-OP-28-2024] para 40. Art. 35 does not oblige the processor to run the DPIA, but Art. 28(3)(f) obliges Clixite to assist — hence a DPIA template is a product deliverable.

### B.5 Lawful basis and the EDPB position on AI models (Opinion 28/2024)

- Opinion 28/2024 (adopted 17 December 2024, on request of the Irish DPC) [EDPB-OP-28-2024]:
  - Anonymity of an AI model is not presumed: a model is anonymous only if both "the likelihood of direct (including probabilistic) extraction of personal data" and "the likelihood of obtaining, intentionally or not, such personal data from queries" are **insignificant**, assessed with "all the means reasonably likely to be used" (para 43; factors in para 41).
  - Legitimate interest (Art. 6(1)(f)) can be a valid basis for development and deployment, applying the three-step test (legitimate interest; necessity; balancing) as detailed in Guidelines 1/2024 (para 50 ff., section 3.3.2); examples of legitimate interests include developing a conversational agent and fraud detection (para 61 / 1084).
  - Reasonable expectations are central (paras 91–95): whether data was publicly available, the relationship with the controller, the source and its privacy settings, and whether data subjects know their data is online.
  - Web-scraping-specific mitigations (paras 104–105): exclude risky publications and sources, honour "robots.txt or ai.txt files or any other recognised mechanism to express exclusion from automated crawling or scraping", limit collection by time, facilitate opt-out.
  - Consequences of unlawful development (scenarios 1–3): a deployer using a third-party model should assess whether the model was developed lawfully (scenario 2, accountability under Arts. 5(1)(a) and 6); if a model is truly anonymised, later deployment processing is not tainted (scenario 3).
- Guidelines 1/2024 on Art. 6(1)(f) (adopted 8 October 2024, version 1.0 for consultation): three cumulative conditions; reasonable expectations and mitigating measures weigh in the balancing test [EDPB-GL-1-2024].
- **EDPB Guidelines 03/2026 on web scraping in the context of generative AI** (adopted 7 July 2026, version 1.0, public consultation until 30 October 2026) [EDPB-GL-3-2026]: scope is scraping of *external* sources for training/fine-tuning — "these guidelines… do not address processing of an organisation's own personal data" (para 5); consent "would most probably not be an applicable legal basis" (para 44); absence of robots.txt "does not amount to consent" (para 45); legitimate interest is the usual basis (paras 43, 46–47); data-minimisation measures before/during/after collection incl. excluding sites that oppose scraping "through… robots.txt or ai.txt files, or CAPTCHA" (para 37), syntax filters, pseudonymisation (para 38). Same day, the EDPB adopted draft Guidelines on anonymisation (three-criteria test: singling out, linkability, inference) for consultation until 30 Oct 2026 [EDPB-NEWS-2026-07-08].
- Applied: (i) ingestion of the customer's **own** content is the customer's processing under its existing bases (contract/legitimate interest for corporate communications) — outside the scope of GL 03/2026 but still subject to minimisation; (ii) fetching **third-party** evidence pages is a targeted scraping activity: use legitimate interest with a documented LIA, honour robots.txt/ai.txt/noai signals, exclude special-category and minor-oriented sources, keep only claim-level excerpts; (iii) answer-engine queries containing personal names: legitimate interest (brand monitoring), minimise, no profiling of individuals.

### B.6 Chapter V transfers (US LLM/answer-engine providers)

- Art. 44 general principle; Art. 45 adequacy; Art. 46(2)(c) SCCs; Art. 49 derogations [GDPR].
- SCCs: Commission Implementing Decision (EU) 2021/914 of 4 June 2021; four modules (C2C, C2P, P2P, P2C); old SCCs could no longer be signed after 27 Sept 2021 and had to be replaced by 27 Dec 2022; Clause 14 requires a transfer impact assessment on local laws and practices [SCC-2021-914], [EC-SCC-PAGE].
- **EU-US Data Privacy Framework — status 2026-09-18:** adequacy decision (EU) 2023/1795 of 10 July 2023 remains in force [DPF-ADEQUACY]; the General Court dismissed the annulment action in *Latombe v Commission* (T-553/23) on 3 September 2025; the applicant appealed on 31 October 2025 (C-703/25 P), **pending** before the Court of Justice with no judgment as of today [CURIA-T-553-23], [EC-ADEQUACY-PAGE] (page updated 23 July 2026 still lists the US/DPF), [EC-EUUS-PAGE]. First periodic review report published October 2024 [EC-ADEQUACY-PAGE].
- Applied: for each US provider, either rely on its DPF certification (check the DPF List) or on 2021 SCCs Module 3 (P2P) with a TIA; prefer EU-region endpoints; provide a contractual fallback if C-703/25 P invalidates the DPF. The Data Act Art. 32 also constrains third-country governmental access to non-personal data held by the SaaS (Section I).

### B.7 Data-subject rights, retention, minimisation

- Arts. 12–22 rights must be exercisable against derived artefacts (entity graph, claim store, generated drafts, logs). Art. 22 (solely automated decisions with legal/similar effects) is not engaged by content drafting, but the Belgian APD brochure flags it for AI systems generally [APD-AI-BROCHURE].
- Art. 5(1)(c) minimisation and 5(1)(e) storage limitation: keep raw ingested documents only as long as needed to maintain the evidence graph; set per-tenant retention; purge prompts/responses held for logging after a defined period, keeping hashes for Art. 50(2) logging.

### B.8 Belgian specifics

- Supervisory authority: Autorité de protection des données / Gegevensbeschermingsautoriteit (APD/GBA). AI-systems brochure (19 Sept 2024; "original version – December 2024") [APD-AI-BROCHURE]. Cookie checklist (Oct 2023) implements Art. 5(3) ePrivacy via Art. 10/2 of the framework law of 30 July 2018 [APD-COOKIE-CHECKLIST] (Section F).
- Belgian AI-Act market-surveillance authority designations were not verified in this session (CCB and other sites blocked) — **requires-legal-assessment** for enforcement contacts.

### B.9 Concrete product controls (GDPR)

1. Tenant-level **data map** auto-generated from connectors (source system, categories, volumes) → feeds the customer's Art. 30 record and DPIA.
2. **DPIA template** pre-filled with the platform's processing description, sub-processor list, transfer mechanisms and TOMs (Art. 28(3)(f)).
3. **PII detection at ingestion** with configurable redaction/pseudonymisation before LLM calls; special-category classifier that blocks by default.
4. **Sub-processor switchboard**: per-tenant allow-list of LLM/answer-engine providers, region pinning, "no-training" API flags, retention settings; export of the current list for the DPA annex.
5. **Rights tooling**: search-and-erase across raw docs, entity graph, drafts and logs; export in machine-readable form.
6. **Robots/opt-out engine** for third-party fetches: honour robots.txt, ai.txt, `noai`/`noimageai` meta and TDM-reservation signals; store the decision per URL.
7. **Retention policies** per artefact class; cryptographic log hashes retained without content.
8. **Transfer register**: for each provider, DPF status or SCC module + TIA date; alert if the DPF is invalidated.

### B.10 Claims we must NOT make (GDPR)

- "No personal data is processed" or "the platform is GDPR-compliant." (Compliance is the controller's; the product can only be "designed to support compliance".)
- "Anonymised" for any artefact unless the EDPB three-criteria test is met; use "pseudonymised" otherwise.
- "Data never leaves the EU" unless every configured provider endpoint is EU-region and the SaaS stack is EU-hosted.
- "LLM providers do not train on your data" unless contractually verified per provider.
- "No DPIA is needed" — the opposite is more likely.

---

## C. Copyright — Directive (EU) 2019/790 (DSM), Directive 2001/29/EC (InfoSoc), AI Act Art. 53(1)(c)

**Verdict: applicable** (TDM and quotation rules for ingestion/evidence use; press-publishers' right for news sources); **requires-legal-assessment** for the copyright status of AI-assisted outputs.

### C.1 Text and data mining (DSM Arts. 3–4) and opt-out

- Art. 2(2) defines TDM as automated analysis of text and data in digital form to generate information (patterns, trends, correlations). Art. 3: mandatory exception for research organisations and cultural-heritage institutions (scientific research). Art. 4: exception for reproductions/extractions of lawfully accessible works for TDM by anyone, **provided the rightholder has not expressly reserved the use in an appropriate manner**, "such as machine-readable means in the case of content made publicly available online" (Art. 4(3)); Recital 18 cites metadata and website terms and conditions as machine-readable means; copies may be kept as long as necessary for the TDM [DSM-2019-790] (EUR-Lex text not re-read in-session).
- Art. 15 press publishers' right: two-year related right for online use of press publications by information-society service providers, excluding hyperlinking and "very short extracts" [DSM-2019-790].
- AI Act Art. 53(1)(c): GPAI *model* providers must "put in place a policy to comply with Union law on copyright… in particular to identify and comply with… a reservation of rights expressed pursuant to Article 4(3) of Directive (EU) 2019/790" [AIA-SD-ART53]; the GPAI Code of Practice Copyright chapter operationalises this (robots.txt / machine-readable opt-outs, no paywall circumvention, output-infringement mitigation) [EC-GPAI-COP].
- Applied: (i) the customer's own content is licensed to the platform by contract — no exception needed; (ii) third-party evidence pages: extraction of claims is TDM under Art. 4 **if** the page is lawfully accessible (no paywall/login bypass) **and** no reservation is expressed (robots.txt directives, TDM-reservation metadata such as the `tdm-reservation` HTTP header/meta, `noai`); reservations must be honoured; (iii) Clixite is not a GPAI provider, so Art. 53(1)(c) is not its duty, but choosing GPAI CoP signatories reduces upstream infringement risk.
- Pending case law: **C-250/25 *Like Company v Google Ireland*** (Grand Chamber) — questions on whether LLM training is a reproduction (InfoSoc Art. 2), whether chatbot outputs reproducing press content are communication to the public (InfoSoc Art. 3 / DSM Art. 15), and whether Art. 4 TDM covers these acts; hearing 10 March 2026; Advocate General's opinion **scheduled 3 September 2026** (delivery not verified in-session); judgment later [CURIA-C-250-25], [EC-IPHELPDESK-2026-04-24]. Outcome could change the TDM analysis for RAG-style display of extracts.
- Policy: the Commission opened a call for evidence on the review of the 2019 Directive on 18 May 2026 (feedback to 25 June 2026), explicitly covering "challenges raised by generative artificial intelligence for the licensing and enforcement of rights" [EC-COPYRIGHT-REVIEW]; the European Parliament's JURI study (9 July 2025) recommends harmonised opt-out mechanisms and clearer input/output rules [EP-STUDY-GENAI-COPYRIGHT].

### C.2 Quotation exception (InfoSoc Art. 5(3)(d))

Quotations "for purposes such as criticism or review" of a work lawfully made available, with source and author indicated, "in accordance with fair practice, and to the extent required by the specific purpose", subject to the three-step test (Art. 5(5)) [INFOSOC-2001-29]. National implementation: Belgian Code of Economic Law, Art. XI.189 (not re-read). Applied: "evidence-grounded" content that reproduces third-party sentences must (a) attribute source and author, (b) quote only what the argumentative purpose requires, (c) not substitute for the original. Paraphrase of facts is outside copyright (facts are not protected), but verbatim reuse of press content triggers Art. 15 unless "very short".

### C.3 Protection of AI-generated outputs in the EU — what is known precisely

- There is **no EU statute** on authorship of AI-generated works. The CJEU standard is that a work must be the "author's own intellectual creation" (*Infopaq*, C-5/08, 16 July 2009; even an 11-word extract can qualify) [CURIA-C-5-08], reflecting the author's free and creative choices (*Painer*, C-145/10; *Cofemel*, C-683/17 — not re-read in-session). Purely machine-generated text with no human creative choices is therefore unlikely to be protected; drafts substantively edited/selected/arranged by a human may be protected to the extent of the human contribution. The EP JURI study (9 July 2025) describes "the uncertain status of AI-generated content" as a fundamental gap [EP-STUDY-GENAI-COPYRIGHT]. The Commission's 2026 review may address it [EC-COPYRIGHT-REVIEW].
- Consequence: customers cannot assume exclusive rights in unedited generated text; competitors may reuse it. The human-approval workflow should record human creative contributions (edits, selection, structure) for evidentiary purposes.

### C.4 Concrete product controls (copyright)

1. TDM-reservation compliance module (robots.txt incl. AI user-agents, `tdm-reservation` header/meta, `noai`, site T&Cs flags); per-URL decision log.
2. Lawful-access guard: never fetch behind paywalls/logins; respect rate limits.
3. Quotation guardrails in the generator: quotes capped and attributed; "very short extract" heuristic for press sources; source URL and author captured in the claim record.
4. Provenance of human contribution: diff-based edit history and reviewer attribution stored with each published version.
5. Upstream model selection policy: prefer GPAI CoP signatories; store their training-content summaries and copyright policies (Art. 53(1)(c)-(d)).

### C.5 Claims we must NOT make (copyright)

- "Generated content is your copyright." / "You own all rights in AI output." (Unsettled; likely not for unedited output.)
- "Using public web pages is always allowed under TDM." (Only lawfully accessible content without a reservation; C-250/25 pending.)
- "The platform is copyright-safe / plagiarism-free."
- "Our LLM providers comply with EU copyright law" unless documented from the provider (CoP signature, Art. 53(1)(c) policy).

## D. Cyber Resilience Act — Regulation (EU) 2024/2847

**Verdict: applicable** for the self-hosted distribution (Clixite = manufacturer of a "product with digital elements"); **potentially-applicable** for the SaaS mode (only where Clixite-operated cloud functions are "remote data processing solutions" of the product); **not-yet-applicable** for the essential requirements/CE marking until 11 December 2027, **but Art. 14 reporting obligations are already live since 11 September 2026**.

### D.1 Dates (Art. 71) — confirmed

- Entry into force: 10 December 2024 [EC-CRA-SUMMARY], [CRA-REG].
- 11 June 2026: provisions on notified bodies (Chapter IV) apply [EC-CRA-SUMMARY].
- **11 September 2026: Art. 14 reporting obligations apply to manufacturers** — actively exploited vulnerabilities and severe incidents; early warning within 24 h, notification within 72 h, final report within 14 days (vulnerabilities, after a corrective measure is available) or 1 month (incidents); via ENISA's Single Reporting Platform (SRP) to the CSIRT of the manufacturer's main establishment [EC-CRA-REPORTING] (page updated 11 Sept 2026), [ENISA-SRP-NEWS], [ENISA-SRP-FAQ].
- ENISA FAQ: reporting obligations from 11 Sept 2026 apply to **all products with digital elements, including those placed on the market before that date**; access requires an EU Login with MFA; portal https://portal.cra-srp.enisa.europa.eu; voluntary reporting not yet supported [ENISA-SRP-FAQ].
- Open-source software stewards' reporting: from 11 December 2027 [EC-CRA-REPORTING].
- **11 December 2027: full application** (essential requirements Annex I, conformity assessment, CE marking, documentation, support period) [EC-CRA-SUMMARY], [EC-CRA-GUIDANCE].

### D.2 Scope applied to the product

- "Product with digital elements" = a software or hardware product and its remote data processing solutions, made available on the market in the course of a commercial activity [EC-CRA-SUMMARY]. Commission guidance C(2026) 5252 final (27 July 2026) devotes its largest part to scope [EC-CRA-GUIDANCE].
- **Self-hosted software sold/licensed to customers = placed on the market → in scope; Clixite is the manufacturer.** Guidance para 41 ff.: supply in the course of a commercial activity is characterised by charging, licensing, monetised support; installing FOSS for a customer without substantial modification is not placing on the market (Example 19), but supplying your own product is [EC-CRA-GUIDANCE].
- **SaaS**: Recital 12 and the summary page — SaaS is excluded unless it constitutes remote data processing of a product [EC-CRA-SUMMARY]. Guidance section 8.1: RDPS requires (i) processing "at a distance", (ii) without which the product could not perform one of its functions, (iii) designed and developed by or under the responsibility of the manufacturer; on-premises/private-cloud services operated by the manufacturer can also be RDPS (para 187); third-party SaaS used by the manufacturer is a *component* subject to due diligence, not RDPS (Example on e-reader storage) [EC-CRA-GUIDANCE].
  - If the self-hosted product depends on Clixite-operated cloud services (licence/update server, answer-engine query proxy, model gateway, telemetry) those services are RDPS of the product and inside the conformity scope.
  - A pure SaaS tenant with no self-hosted product is outside the CRA (but inside NIS2 supply-chain expectations, Data Act, GDPR).
- **Open-source steward**: only a legal person, other than a manufacturer, that systematically supports FOSS "intended for commercial activities" but not itself placed on the market (Art. 3(14); guidance paras 69–71) [EC-CRA-GUIDANCE]. If Clixite open-sources the core **and** sells it/hosts it commercially, Clixite is a manufacturer for the commercial product, not a steward. FOSS monetised only by donations is not placed on the market (paras 60–61).
- Product class: a GEO content platform is not listed in Annex III/IV (important/critical) → default category → **self-assessment** (Module A) [EC-CRA-SUMMARY].

### D.3 Obligations (manufacturer)

- Annex I Part I essential requirements: secure-by-default configuration, no known exploitable vulnerabilities at release, access control, confidentiality/integrity, minimisation, resilience, logging/monitoring capabilities, secure updates; Part II vulnerability handling: **SBOM** of at least top-level dependencies, coordinated vulnerability disclosure policy, security updates for the support period (at least 5 years unless shorter expected lifetime), free and timely security updates separate from feature updates [CRA-REG], [EC-CRA-SUMMARY] (text of Annex I not re-read in-session).
- Art. 13: risk assessment, due diligence on third-party components (incl. FOSS), technical documentation, EU declaration of conformity, CE marking, support period disclosure [EC-CRA-SUMMARY].
- Art. 14 reporting (live) — see D.1.
- Penalties (Art. 64): up to EUR 15 m / 2.5 % for essential-requirement breaches; small enterprises are spared fines for missing the 24-hour early-warning deadline; stewards face no fines [EC-CRA-SUMMARY].

### D.4 Concrete product controls (CRA)

1. Register on the ENISA SRP now (EU Login + MFA), name the reporting representative, write the 24 h / 72 h / 14 d runbook — this is a **current** obligation for the self-hosted product.
2. Generate an SBOM (SPDX or CycloneDX) at each release; ship it with the self-hosted package; keep a machine-readable vulnerability disclosure policy and `security.txt`.
3. Secure-by-default install: no default credentials, TLS on, least-privilege service accounts, signed releases and update channel, dependency pinning.
4. Define the support period and end-of-support date in the licence and documentation.
5. Inventory Clixite-operated cloud endpoints used by the self-hosted product (RDPS) and include them in the risk assessment and technical documentation.
6. Technical file skeleton now; conformity assessment (Module A) by 11 Dec 2027.

### D.5 Claims we must NOT make (CRA)

- "CRA-certified" / "CE-marked" before an actual EU declaration of conformity (not possible before the essential requirements apply; no third-party certification is required for the default class).
- "SaaS is out of the CRA" as a blanket statement (RDPS analysis needed).
- "Open-source, so exempt" if the software is commercialised.
- "No reporting obligations until 2027" — reporting is live since 11 Sept 2026.

---

## E. NIS2 — Directive (EU) 2022/2555; Belgian Law of 26 April 2024

**Verdict: customer-specific** (many customers are essential/important entities and will flow down Art. 21 supply-chain requirements); Clixite's own in-scope status: **requires-legal-assessment** (most likely out of scope as a small entity not in an Annex I/II sector, but the "ICT service management / managed service provider" category should be checked).

### E.1 Framework

- NIS2 applies to medium and large entities in Annex I (high-criticality: energy, transport, banking, health, digital infrastructure, ICT service management B2B, public administration, space…) and Annex II sectors (postal, waste, chemicals, food, manufacturing, digital providers, research); transposition deadline 17 October 2024; management-body accountability (Art. 20); Art. 21(2) minimum measures (a)–(j): risk-analysis and security policies; incident handling; business continuity and crisis management; **supply-chain security incl. relationships with direct suppliers/service providers (d)**; secure acquisition, development and maintenance incl. vulnerability handling (e); effectiveness assessment; cyber-hygiene and training; cryptography; HR security, access control, asset management; MFA/secure communications (j); Art. 23 reporting 24 h / 72 h / 1 month; fines up to EUR 10 m or 2 % (essential) / EUR 7 m or 1.4 % (important) (Art. 34) [NIS2-DIR] (text not re-read in-session), [EC-NIS2-PAGE].
- **Belgium**: Law of 26 April 2024 "establishing a framework for the cybersecurity of networks and information systems of general interest for public security" (published Moniteur belge 17 May 2024; in force 18 October 2024); CCB designated national authority (Royal Decree of 9 June 2024); registration of in-scope entities via Safeonweb@Work by 18 March 2025 (digital-infrastructure providers by 18 Dec 2024); conformity may be demonstrated through **CyberFundamentals (CyFun®)** assurance levels (Basic / Important / Essential) verified or certified by CCB-accredited bodies, or ISO/IEC 27001 certification; the CCB advises organisations in the supply chain of NIS2 entities to comply at least with **CyFun Basic** [CCB-NIS2-PAGE] (official page content obtained via the search index; direct fetch returned HTTP 403), [BE-NIS2-LAW].
- Belgian Art. 30 of the law mirrors Art. 21 (measures; §1, 4° supply chain; §5 written information-security policy) — not re-read in-session; treat as requires-legal-assessment for exact wording.

### E.2 What an in-scope customer will ask the vendor for (Art. 21(2)(d), (e), (j))

A supplier questionnaire mapped to NIS2 typically requires: security policy and risk-management framework; incident-notification SLA compatible with the customer's 24 h early warning; vulnerability disclosure and patch SLAs; SBOM; secure-development lifecycle evidence; MFA and role-based access; encryption in transit/at rest; logging and monitoring; business continuity/backup and RTO/RPO; sub-contractor list and locations; penetration-test summaries; certifications (CyFun level, ISO/IEC 27001, SOC 2); data-residency; exit/return of data.

### E.3 Concrete product controls (NIS2)

1. Obtain **CyFun Basic** (self-assessment) as a minimum, target CyFun Important verification or ISO/IEC 27001 for the SaaS operation.
2. Publish a vendor security whitepaper + pre-filled NIS2 supplier questionnaire; commit contractually to incident notification to customers within 24 h of awareness where their systems/data are affected.
3. Enforce MFA/SSO (SAML/OIDC) and RBAC in the product; audit logs exportable to the customer's SIEM.
4. Hardening guide for self-hosted deployments; signed releases; CVE feed.

### E.4 Claims we must NOT make (NIS2)

- "NIS2-compliant / NIS2-certified product." (NIS2 binds entities, not products; there is no product certification.)
- "Using our platform makes you NIS2-compliant."
- Any statement about Clixite's own NIS2 status before a legal check of the Belgian law's scope criteria.

## F. ePrivacy — Directive 2002/58/EC Art. 5(3) (as amended 2009/136/EC); EDPB Guidelines 2/2023; Belgian Art. 10/2 framework law

**Verdict: applicable** to Clixite's own web properties and to any script/pixel the platform injects into published pages; **customer-specific** for the customer's websites; "privacy-preserving analytics without consent" is **not available in Belgium today** except within the strictly-necessary exemption.

### F.1 Law and EDPB interpretation

- Art. 5(3): storing information, or gaining access to information already stored, in a user's terminal equipment is allowed only with informed consent, except for the sole purpose of transmission or where strictly necessary to provide an information-society service explicitly requested by the user [EPRIVACY-DIR] (text not re-read in-session).
- EDPB Guidelines 2/2023 on the technical scope of Art. 5(3) (version 2.0 adopted 7 October 2024, published 16 Oct 2024): applies "regardless of whether or not it is personal data" (para 10, quoting the CJEU); any instruction to the terminal to send back stored information triggers Art. 5(3) — cookies, JavaScript asynchronous requests, SDKs (paras 32–34); **URL and pixel tracking** are in scope (paras 47–48); **local processing** whose results are sent to a server is in scope (paras 52–53); **tracking based on IP only** can be in scope where the IP originates from the terminal (paras 54–55); applicability does not automatically mean consent is required — exemptions must be assessed (para 56) [EDPB-GL-2-2023].
- Belgian APD cookie checklist (Oct 2023): only "technical essential" and "strictly necessary functional" cookies are exempt (language choice, cookie preferences, cart); footnote 12: **visitor counting is in principle not strictly necessary** (citing WP29 Opinion 04/2012); the checklist notes that some other Member States' regulators exempt analytics under strict conditions, sometimes because national law was amended — which is *not* the Belgian position; "reject all" must sit at the same level as "accept all"; no cookie walls; no deceptive design; consent-preference cookie lifetime of about 6 months considered reasonable; legal basis Art. 10/2 of the framework law of 30 July 2018 [APD-COOKIE-CHECKLIST].
- Pending change: the Commission's **Digital Omnibus (data) proposal of 19 November 2025** would insert Art. 88a GDPR listing purposes not requiring consent, including "generating aggregated audience measurement data", plus Art. 88b browser signals; as of 2026-09-18 it is still a proposal in the ordinary legislative procedure with no adopted text (status per secondary reporting; no OJ publication found) — **not-yet-applicable**, do not build on it.

### F.2 Applied

- Answer-engine querying through official APIs does not touch any user's terminal — outside Art. 5(3).
- Server-side crawling/ingestion of the customer's pages — outside Art. 5(3).
- **Visibility measurement on published pages**: if the platform injects an analytics script, pixel, or fingerprinting-style beacon into the customer's pages, Art. 5(3) applies and, in Belgium, consent is required for analytics. Server-log-based aggregate metrics computed by the customer's own web server from data sent for transmission purposes can avoid Art. 5(3) but must not add identifiers or client-side instructions; treat IP-based tracking as in scope (GL 2/2023 paras 54–55).
- Clixite's own marketing site and the SaaS console: standard consent banner per the APD checklist; strictly-necessary session/auth cookies exempt.

### F.3 Concrete product controls (ePrivacy)

1. Default: **no client-side beacons** in published content; measurement from answer-engine APIs, search-console-type APIs and the customer's server logs (aggregated, no cross-site identifiers).
2. Optional analytics injection only behind the customer's CMP with the "analytics" purpose; document the consent-string check.
3. Console: strictly-necessary cookies only by default; APD-checklist-conformant banner if any non-essential tracking is added.

### F.4 Claims we must NOT make (ePrivacy)

- "Cookie-less analytics needs no consent." (Pixels, JS calls, fingerprinting and IP tracking are all in scope; Belgium grants no analytics exemption.)
- "Our tracking is anonymous, so ePrivacy does not apply." (Art. 5(3) applies regardless of personal data.)
- Any reliance on the proposed GDPR Art. 88a audience-measurement carve-out before adoption.

---

## G. Digital Services Act — Regulation (EU) 2022/2065

**Verdict: potentially-applicable** at the lightest tier (hosting service) for the Clixite-operated SaaS; **non-applicable** for the self-hosted mode and for the "online platform" tier.

- Art. 2(1): applies to intermediary services offered to recipients in the Union; Art. 3(g): "intermediary service" = mere conduit, caching or hosting; hosting = storage of information provided by, and at the request of, a recipient; Art. 3(i): "online platform" = hosting service that also disseminates the stored information **to the public**; Art. 3(k): dissemination to the public = making information available to a potentially unlimited number of third parties; fully applicable since 17 February 2024 [DSA-REG]. Recital 13 treats cloud services as intermediary services only where they store recipient information; B2B cloud storage without public dissemination is at most a hosting service.
- Applied: in SaaS mode Clixite stores customer documents at the customer's request → could be a hosting service (Arts. 11–12 points of contact, Art. 14 terms and conditions, Art. 15 transparency reporting — micro/small enterprises exempt from Art. 15 per Art. 15(2), Art. 16 notice-and-action, Art. 17 statement of reasons) — but the generated content is **published on the customer's own site**, not disseminated by Clixite, so Clixite is **not an online platform**. Self-hosted: no intermediary service at all. The Art. 50 Guidelines confirm that hosting providers merely disseminating third-party AI content are not deployers under the AI Act (para 16) [EC-ART50-GL] — the DSA and AI Act roles are independent.
- Product controls: publish a single point of contact for authorities and users (Arts. 11–12) and an abuse/notice channel; T&Cs describing content restrictions and moderation (Art. 14) — cheap and reduces argument.
- Claims we must NOT make: "DSA does not apply to B2B" as an absolute; "we are a platform" (in the DSA sense) in marketing copy — avoid the term "online platform" for the SaaS.

---

## H. Accessibility — European Accessibility Act (Directive (EU) 2019/882), Web Accessibility Directive (EU) 2016/2102, EN 301 549, WCAG 2.2

**Verdict:** EAA — **customer-specific** (the platform's own UI is B2B enterprise software outside Art. 2, but content published on customer **e-commerce** websites and consumer-facing services is in scope for the customer since 28 June 2025); WAD — **customer-specific** (public-sector customers); no direct obligation on Clixite's console, but strong contractual pull → design to WCAG 2.2 AA / EN 301 549.

### H.1 Scope and dates

- EAA applies since **28 June 2025** to the products and services listed in Art. 2: consumer general-purpose computer hardware/OS, self-service terminals, consumer terminal equipment for electronic communications and audiovisual media, e-readers; services: electronic communications, access to audiovisual media, elements of passenger transport, consumer banking, e-books, **e-commerce services** (Art. 3(30): services provided at a distance, through websites and mobile-device-based services, by electronic means and at the individual request of a consumer with a view to concluding a consumer contract) [EAA-DIR] (text not re-read in-session), [EC-EAA-PAGE] (lists the ten covered categories). Microenterprise exemption for **service** providers (Art. 4(5)); transitional period to 28 June 2030 for service contracts concluded before 28 June 2025 (Art. 32) [EAA-DIR].
- B2B enterprise software (the GEO console) is not a listed product or service → **non-applicable** to the console itself; but the *web content the platform publishes* becomes part of the customer's e-commerce service or consumer-facing website and must not break its accessibility (Annex I Section III/IV: information, website content perceivable, operable, understandable, robust).
- WAD applies to public-sector bodies' websites/apps [WAD-DIR]; harmonised standard **EN 301 549 v3.2.1 (2021)** cited via Commission Implementing Decision (EU) 2021/1339 (WCAG 2.1 AA) [EC-WAD-PAGE].
- **EN 301 549 V4.1.1 (2026-09)** published by ETSI/CEN/CENELEC in September 2026: clauses 9–11 "updated to align with the WCAG 2.2"; new Annex ZA (Directive 2016/2102) and Annex ZB (Directive 2019/882); national transposition dates 24 Aug 2026 / 30 Nov 2026; doa 31 May 2027 [ETSI-EN301549-V411]. It becomes the presumption-of-conformity route only once cited in the OJ under the WAD/EAA — **not yet cited as of 2026-09-18** (no OJ citation found; the Commission WAD page still cites v3.2.1) [EC-WAD-PAGE].
- WCAG 2.2: W3C Recommendation (latest revision 12 December 2024); nine new success criteria (2.4.11 Focus Not Obscured (Minimum), 2.4.12, 2.4.13, 2.5.7 Dragging Movements, 2.5.8 Target Size (Minimum), 3.2.6 Consistent Help, 3.3.7 Redundant Entry, 3.3.8 Accessible Authentication (Minimum), 3.3.9); 4.1.1 Parsing removed [W3C-WCAG22].
- The AI Act Code of Practice cross-references EN 301 549 / WCAG for the accessibility of AI labels [EC-COP-TRANSPARENCY].

### H.2 Concrete product controls (accessibility)

1. Console built to **WCAG 2.2 AA** (superset of the current v3.2.1/WCAG 2.1 route and of the forthcoming V4.1.1 route); publish an accessibility statement and VPAT/EN 301 549 conformance report for procurement.
2. Output linting: semantic headings, alt-text generation and mandatory review for images, link text, table headers, language attributes, contrast-safe embeds, no auto-playing media; block publication on critical failures.
3. AI label/icon rendering with high contrast, alt text and screen-reader compatibility (CoP Section 2 Measure 1.1 requirements).

### H.3 Claims we must NOT make (accessibility)

- "EAA-compliant platform" (the console is outside the EAA; conformance claims must reference the standard and a tested version).
- "Generated content is accessible" without automated + manual checks.
- "EN 301 549 V4 is the legal standard" before OJ citation.

---

## I. Data Act — Regulation (EU) 2023/2854, Chapter VI (switching between data processing services)

**Verdict: applicable** to the Clixite-operated SaaS (a "data processing service"); **non-applicable** to the self-hosted mode.

- Applicable since **12 September 2025**; connected-product design obligations from 12 Sept 2026; **switching charges must be zero from 12 January 2027** (reduced, cost-based charges allowed until then) [EC-DATA-ACT-EXPLAINED], [DATA-ACT] (text not re-read in-session).
- "Data processing service" = a digital service enabling ubiquitous, on-demand network access to a shareable pool of configurable, scalable and elastic computing resources (IaaS, PaaS, **SaaS**) (Art. 2(8)) [EC-DATA-ACT-EXPLAINED].
- Obligations (Arts. 23–31): remove pre-commercial, commercial, technical, contractual and organisational obstacles to switching and to parallel use; contract must state the customer's right to switch, a **maximum 2-month notice**, a **30-day transition period** (extendable once if technically unfeasible), full erasure after retrieval, the list of exportable data and, where relevant, non-exportable third-party data; export in a structured, commonly used, machine-readable format; **open interfaces / API** for SaaS (functional equivalence only for IaaS); information on available formats, transfer restrictions and third-country jurisdiction; exemption for **custom-built** services developed for a single customer and for testing/evaluation services (Art. 31) [EC-DATA-ACT-EXPLAINED].
- Art. 32: providers must take measures against unlawful third-country governmental access to non-personal data and inform the customer [EC-DATA-ACT-EXPLAINED].
- Commission non-binding standard contractual clauses for cloud contracts and FAQs exist as drafts/recommendations (referenced on the Commission Data Act pages; not re-read).

### I.1 Concrete product controls (Data Act)

1. **Tenant export** endpoint: documents, entity/claim graph, drafts, published versions, logs — in JSON/CSV/HTML with a documented schema; bulk export within the 30-day window.
2. Contract templates with the Art. 25 mandatory terms; no exit fees from 12 Jan 2027; itemised, cost-based switching charges until then.
3. Public API and interface documentation (open interfaces); import tooling for the self-hosted edition (parallel use / migration path).
4. Data-location and third-country-access statement; process for handling foreign authority requests (Art. 32).

### I.2 Claims we must NOT make (Data Act)

- "Data Act does not apply to SaaS" (it does).
- "Free export" only if exports are complete (all exportable data) and the format is documented.
- "Functional equivalence guaranteed" (that duty is for IaaS; for SaaS the duty is open interfaces and export).

---

## J. Provenance — C2PA, IPTC, AI Act linkage, practical options for HTML

**Verdict: applicable** (as the technical means for AI Act Art. 50(2)/(4) and CoP measures); no standard is legally mandated.

### J.1 Current state of standards

- **C2PA Content Credentials Technical Specification 2.4** (released April 2026) — current version; 2.2 was 1 May 2025, 2.3 January 2026. 2.4 adds the `c2pa.ai-disclosure` assertion for machine-readable AI-transparency information, the Content Credential JSON (crJSON) serialisation, and lists asset types including PDF, **HTML**, unstructured and structured text (Markdown, YAML, source), fonts, plus hard bindings (byte-range hashes), **soft bindings** (fingerprints/invisible watermarks) and **remote manifests** [C2PA-SPEC-2.4]. Trust is anchored in the C2PA Trust List introduced in 2.2 [C2PA-SPEC-2.4].
- C2PA **Guidance for AI/ML** (2.3): use `digitalSourceType` `trainedAlgorithmicMedia` for generative outputs (`c2pa.trainedAlgorithmicData` for non-media outputs), asset-type assertions for models, data-mining ("do not train") assertions; it gives no specific guidance for text/HTML and does not mention the EU AI Act [C2PA-AIML-GUIDANCE].
- **IPTC Digital Source Type** vocabulary (last modified 23 Oct 2024): `trainedAlgorithmicMedia` ("Digital media created algorithmically using an Artificial Intelligence model trained on captured content"), `compositeWithTrainedAlgorithmicMedia` ("Augmentation, correction or enhancement using a Generative AI model…"), `algorithmicMedia`, `compositeSynthetic`, `digitalCapture`, `humanEdits` [IPTC-DST]; used inside C2PA `c2pa.actions` and in IPTC/XMP photo metadata (IPTC Photo Metadata Standard 2025.1).
- **Does the AI Act / Code of Practice reference C2PA?** No, not by name. The Guidelines (para 73) list "cryptographic methods for proving provenance and authenticity", metadata, watermarks, logging, fingerprints; para 76 requires "publicly-available industry standard detection solutions" where they exist [EC-ART50-GL]. The Code of Practice Section 1 requires **digitally signed metadata** (Sub-measure 1.1.1) for formats that carry metadata — "containerised text" included — plus **imperceptible watermarking** (1.1.2), optional **fingerprinting or logging** (1.1.3), non-removal of markings (Measure 1.2), optional richer provenance metadata (Measure 1.3), and staged interoperability (Measure 3.4: metadata standards from 2 Aug 2026; detection access method/signpost by 2 Feb 2027) [EC-COP-TRANSPARENCY]. Digitally signed metadata with an open trust model is, in practice, C2PA; the Code deliberately stays standard-neutral.

### J.2 Practical options for HTML content produced by the platform

1. **Human-visible disclosure (Art. 50(4), when the exception does not apply)**: EU icon "AI GENERATED" / "AI MODIFIED" (CoP Annex 1) placed adjacent to the content at first exposure, with alt text and screen-reader compatibility; optional second layer (hover/click) with details [EC-COP-TRANSPARENCY].
2. **Machine-readable page-level disclosure (defensible today, cheap)**: `<meta>` / JSON-LD statements (e.g., schema.org `CreativeWork` with a custom `isBasedOn`/`creator` note and IPTC `digitalSourceType` URI), an `X-AI-Disclosure`-style HTTP header, and a `/.well-known/ai-disclosure` or per-page manifest URL. These are not yet formal standards; they satisfy the "metadata identification" technique in Guidelines para 73 only if paired with signing/logging for robustness.
3. **C2PA manifests**: (a) for images generated/edited by the platform — embed C2PA manifests with `c2pa.actions` (`digitalSourceType` = trainedAlgorithmicMedia / compositeWithTrainedAlgorithmicMedia) and `c2pa.ai-disclosure`; (b) for HTML/text — C2PA 2.4 supports HTML and text assets via remote manifests + hashing, which fits "containerised text"; adoption by browsers is nil today, so treat it as the interoperability layer for verifiers and archives rather than end-user display.
4. **Watermarked free-form text**: only achievable at the model level (provider-side statistical watermarks); rely on the upstream provider's watermark and detection endpoint (Guidelines para 74), record model+version per output; if no provider watermark exists, document why the state of the art was not "technically feasible" and compensate with logging + signed metadata.
5. **Logging layer**: append-only log of output hash, model, timestamp, prompt/evidence IDs, reviewer/approval events; expose a verification endpoint that answers "was this text generated by a Clixite-operated system?" (CoP Sub-measure 1.1.3 "direct logging may be appropriate for text content").
6. **Non-removal**: the publishing connector must not strip C2PA/IPTC/XMP metadata from images or the page-level disclosure (CoP Measure 1.2).

### J.3 Claims we must NOT make (provenance)

- "C2PA is required by the AI Act." (Not named; standard-neutral.)
- "Our HTML carries Content Credentials verified by browsers." (No browser support; verification is via tools.)
- "Text is watermarked" unless provider-side watermarking is actually applied and detectable.

---

## K. Cross-cutting: deployment-mode matrix and deliverables

### K.1 Who carries what, by deployment mode

| Obligation | Self-hosted (customer runs it) | SaaS (Clixite runs it) |
|---|---|---|
| AI Act Art. 50(2) marking/detection | Clixite (provider) — must ship in the product | Clixite (provider) |
| AI Act Art. 50(4) disclosure / editorial-control exception | Customer (deployer) — product must make it easy | Customer (deployer) — same |
| AI Act Art. 4 literacy | Both (Clixite for its staff; customer for users) | Both |
| GDPR controller | Customer | Customer |
| GDPR processor (Art. 28 DPA) | None for customer data; Clixite only for support/telemetry access | Clixite; sub-processors = LLM/answer-engine/hosting providers |
| GDPR Chapter V transfers to LLM providers | Customer contracts directly with providers (or via product's BYO-key) → customer's transfer tool | Clixite's P2P SCCs/DPF reliance, flowed down in the DPA |
| DPIA | Customer (Clixite supplies template/inputs) | Customer (same) |
| CRA manufacturer duties (Art. 13, 14, Annex I) | **Clixite** — product with digital elements | Only for RDPS components used by the self-hosted product; pure SaaS out of CRA |
| NIS2 Art. 21 flow-down | Customer asks for secure-development evidence, SBOM, CVD | Customer asks additionally for operational security (CyFun/ISO 27001, incident SLAs) |
| ePrivacy Art. 5(3) | Customer's site; product must default to no beacons | Same + Clixite's console cookies |
| DSA hosting-service duties | None | Potentially Clixite (points of contact, T&Cs, notice channel) |
| EAA/WAD | Customer's public sites; product output must not break conformity | Same |
| Data Act Ch. VI switching | Not applicable | **Clixite** — export, notice/transition terms, no fees from 12 Jan 2027 |
| Provenance standards | Product feature | Product feature |

### K.2 Documentation deliverables (what sales/legal will be asked for)

1. AI Act transparency statement: system description, provider identity, marking techniques per modality, detection route, Code-of-Practice signatory status, Art. 50(4) guidance for customers, model registry excerpt.
2. Intended-purpose and acceptable-use policy (excludes Annex III uses and electoral influence).
3. DPA with sub-processor annex, transfer annex (DPF/SCC/TIA per provider), TOMs annex; DPIA template; data map export; retention schedule.
4. Copyright and evidence policy: TDM-reservation handling, quotation rules, press-source rules, statement on rights in outputs.
5. CRA technical file skeleton: risk assessment, SBOM, CVD policy, support period, SRP reporting runbook; EU declaration of conformity (by 11 Dec 2027).
6. Security package for NIS2 customers: whitepaper, CyFun attestation/ISO 27001, incident-notification SLA, pen-test summary, hardening guide.
7. Accessibility conformance report (EN 301 549 / WCAG 2.2 AA) and accessibility statement.
8. Data Act exit plan: export formats/schema, notice and transition terms, fee schedule to 12 Jan 2027.
9. DSA point of contact and notice channel (SaaS).

## L. Watchlist — pending changes with dates (as of 2026-09-18)

| Item | Status today | Next milestone | Impact on product |
|---|---|---|---|
| AI Act Art. 50(2) grace period for pre-2 Aug 2026 systems | running | **2 Dec 2026** | Marking must be in production by then if the platform was on the market before 2 Aug 2026 |
| CoP Measure 3.4 interoperability (detection access method / signpost) | staged | **2 Feb 2027** | Publish detection API/signpost |
| Harmonised standards for Art. 50 marking (CEN/CENELEC request C(2025) 3871 referenced by the Guidelines) | in development | unknown | May replace CoP-based demonstration |
| Annex III high-risk rules | deferred | 2 Dec 2027 | None unless repurposed (elections) |
| EDPB Guidelines 03/2026 web scraping — final | consultation to 30 Oct 2026 | final adoption expected 2027 | Adjust third-party fetch policy |
| EDPB anonymisation guidelines — final | consultation to 30 Oct 2026 | 2027 | Wording of any "anonymised" claim |
| EU-US DPF appeal C-703/25 P | pending | hearing/AG opinion not announced | Transfer fallback to SCCs + TIA must be ready |
| CJEU C-250/25 Like Company | AG opinion scheduled 3 Sep 2026 (delivery unverified); judgment 2027 | 2027 | TDM/RAG display of press extracts |
| Commission copyright review (call for evidence 18 May 2026) | study underway | possible targeted initiative 2027 | Opt-out standardisation; AI-output status |
| Digital Omnibus (data): GDPR Art. 88a/88b cookie rules | proposal (19 Nov 2025) in OLP | trilogues 2026–2027 | Could allow consent-free aggregated audience measurement in future; not now |
| CRA full application | — | **11 Dec 2027** | CE marking, declaration of conformity, technical file |
| Data Act switching charges abolished | reduced charges allowed | **12 Jan 2027** | Remove exit fees |
| EN 301 549 V4.1.1 citation in OJ under WAD/EAA | published Sept 2026, not cited | national transposition by 30 Nov 2026; OJ citation expected thereafter | WCAG 2.2 AA becomes the harmonised route |
| Belgian AI Act market-surveillance designations | not verified | — | Enforcement contacts |

## M. Open questions that require legal assessment

1. Clixite's own NIS2 status under the Belgian law (size thresholds; whether operating a SaaS content platform is "ICT service management (B2B)"/managed service provision).
2. Exact wording of Art. 30 of the Belgian NIS2 law and CCB expectations for suppliers (CyFun level) — CCB pages were unreachable in-session.
3. Whether the platform's third-party evidence fetching, when displayed as quotations in generated drafts, remains within Art. 4 DSM TDM + Art. 5(3)(d) InfoSoc after the CJEU rules in C-250/25.
4. Rights allocation in contracts for AI-assisted outputs given the uncertain copyright status (warranties, indemnities, ownership language).
5. Whether Clixite-operated cloud endpoints used by the self-hosted edition constitute RDPS (CRA) — depends on final architecture (three-element test in the Commission guidance, section 8.1).
6. Whether any customer segment (e.g., listed companies publishing investor information, healthcare, public bodies) systematically falls inside Art. 50(4) "matters of public interest" so that the editorial-control mode must be mandatory for them.
7. The DSA hosting-service characterisation of the SaaS and the minimum Art. 11–17 set applicable to a micro/small enterprise.
8. Belgian market-surveillance authorities for the AI Act and the national penalties regime for SMEs.

## N. Source-quality note

Primary sources cited: 68 entries in `sources.yaml` (regulations, directives, Commission guidelines and official pages, EDPB opinions/guidelines, ENISA, CJEU/General Court listings, ETSI/W3C/C2PA/IPTC standards, Belgian APD documents). Where a primary text could not be re-read in-session (EUR-Lex WAF challenge; CCB/APD French-domain bot protection), the entry says so and the narrative paraphrases from stable article numbering or from an official Commission page that restates the provision. Nothing in this analysis relies on a law-firm summary for a legal proposition.
