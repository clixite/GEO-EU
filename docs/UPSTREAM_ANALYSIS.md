# GEOFlow upstream forensic analysis

Scope: repository `yaojingang/GEOFlow`, local clone at `scratchpad/geoflow-upstream`, commit `9ed2fe80457d5eb280a4bca7cf799895bf2ca3b1` (branch `main`). All paths below are relative to the repo root unless noted. Statements are grounded in the code as cloned; nothing is inferred from README claims alone unless flagged "(README claim)".

Status: COMPLETE (sections 1-18).

## 1. Identity

| Item | Value | Source |
|---|---|---|
| Repository | `github.com/yaojingang/GEOFlow` | `version.json`, `NOTICE` |
| Default branch | `main` (clone `git branch --show-current`) | git |
| Analysed commit | `9ed2fe80457d5eb280a4bca7cf799895bf2ca3b1` — "fix: 修复 AI 工作台设置保存后的页面空白 (#147)" | git |
| Source version | `3.2.0-beta.1`, tag `v3.2.0-beta.1`, release_date 2026-09-16, release_type "minor" | `version.json` |
| Latest stable | `v3.1.0` (2026-09-09). `version.json.upgrade_tip_en`: "Production environments should continue using the latest stable 3.1.0 release." | `version.json`, `docs/CHANGELOG_en.md` |
| Preview components | CLI `0.4.0-preview.1`, Skill `1.2.0-preview.1`, Updater build "declaring compatibility with this Core contract"; v3.1.0 shipped Updater `0.4.0`, bundled CLI `0.2.0`, Chrome extension `0.1.0` | `version.json`, `docs/CHANGELOG_en.md` |
| Tags present | v2.1.1, v2.1.2, v2.2.0, v2.3.0, v3.0.0, v3.1.0, v3.2.0-beta.1 | `git ls-remote --tags` |
| Copyright holder | "Copyright 2026 Yao Jingang" | `NOTICE` |
| Licence | **AGPL-3.0-only** (LICENSE = verbatim GNU AGPL v3 text; `package.json.license = "AGPL-3.0-only"`). NOTICE: "Alternative commercial terms may be available from the copyright holder". Licence change to AGPL happened with v3.0.0 (2026-09-05, "License and contribution governance" in CHANGELOG_en). | `LICENSE`, `NOTICE`, `package.json`, `docs/CHANGELOG_en.md` |
| Historical licence | "Portions originally received under Apache-2.0 remain subject to Apache-2.0; its text is retained at docs/licenses/Apache-2.0.txt" (v2.x releases were Apache-2.0). | `NOTICE` |
| Third-party licences | `docs/licenses/Apache-2.0.txt` (10 254 B), `docs/licenses/deepseek-harness-MIT.txt` (© 2026 DeepSeek), `docs/licenses/deepseek-harness-desktop-MIT.txt` (© 2026 Anywhere Labs). NOTICE states the AI Workspace "run-status projection, task motion, event timeline, model readiness and Agent Turn patterns include adaptations inspired by DeepSeek Harness and DeepSeek Harness Desktop 2.0.2". | `NOTICE`, `docs/licenses/` |
| CLA | `CLA.md` v1.0 (2026-08-30), adapted from Harmony CA 1.0 "outbound option five": contributor retains copyright, grants Yao Jingang a perpetual, irrevocable, sublicensable copyright + patent licence permitting relicensing under "copyleft, permissive, commercial, or proprietary licenses"; moral-rights waiver; acceptance via PR declaration. | `CLA.md` |
| Copyright headers in source | Effectively none: only 1 file in `app/`, `packages/`, `browser-extension/src` matches `Copyright|SPDX-License` and that hit is a false positive (`app/View/Composers/SiteLayoutComposer.php` has no licence header — it matched on an unrelated string). No SPDX identifiers anywhere in PHP sources. Licence attribution relies solely on root `LICENSE`/`NOTICE`. | grep |
| Stack | PHP ^8.3, Laravel ^12, `laravel/ai` ^0.10.3, Horizon ^5.45, Reverb ^1.0, Sanctum ^4.3; frontend Vite 7 + Tailwind 4 + vditor + marked + DOMPurify + laravel-echo/pusher-js; PHPUnit ^11.5; no PHPStan/Psalm in `composer.json`. | `composer.json`, `package.json` |

### Chinese-language prevalence (measured by scanning for CJK code points U+4E00–U+9FFF)

| Artifact | Files containing CJK | Comment |
|---|---|---|
| `app/**/*.php` | 237 / 889 | Docblocks and many user-facing strings are Chinese (e.g. `SiteLayoutComposer`: "为前台 Blade 布局注入站点名称…"). |
| `tests/**/*.php` | 161 / 348 | Test names/assert messages frequently Chinese. |
| `resources/views/**` | 42 / 417 | Most UI text is externalised via `lang/`. |
| `config/*.php` | 13 / 17 | Comments Chinese. |
| `routes/*.php` | 3 / 4 | |
| `database/migrations` | 18 / 166 | |
| `docs/**/*.md` | 94 / 102 | Docs are Chinese-first with `_en` twins for a subset (CHANGELOG_en, GEOFLOW_CLI_en, blue-green_en, upgrade_en). |
| `README.md` | 3 379 CJK chars of 10 422 | README is Chinese-first; `docs/readme/` holds translations. |
| `.agents/skills/geoflow/**` | 23 / 63 | `SKILL.md` itself is 0 CJK chars (English); references, reports and the example theme (`examples/qiaomu-editorial-20260418`) are Chinese. |
| `docs/agent-config/AGENTS.md` | 799 CJK chars of 2 096 | Maintainer rules bilingual, Chinese dominant. |
| Git history | Commit subjects mostly Chinese (`fix: 修复 …`), some English. | git log |
| `lang/` | `en, es, ja, pt_BR, ru, zh_CN, zh_TW` (JSON + PHP) | Seven locales; zh_CN is the source language. |
| Browser extension | `_locales/{en,es,ja,pt_BR,ru,zh_CN}`; `src/adapters/zhihu-answer.js` is the only content adapter (Zhihu, a Chinese Q&A site). | `browser-extension/` |
| AI providers | AiVisibility clients target DeepSeek and Doubao (ByteDance Ark) — see §9/§10. | `app/Services/GeoFlow/AiVisibility/` |

Conclusion: the codebase is Chinese-first at the level of comments, tests, docs, README and product assumptions (Zhihu, Doubao, DeepSeek, WeChat export `app/Support/Admin/WeChatArticleHtmlExporter.php`, BaoTa panel fallbacks). English is a translation layer, not the source of truth.

## 2. Architecture overview

GEOFlow is a single Laravel 12 monolith (PHP ^8.3) that bundles admin UI, public site(s), REST API, queue workers, realtime, a CLI, an out-of-tree updater agent and a Chrome extension. Size: 889 PHP files under `app/`, 95 Eloquent models, 166 migrations, ~140 classes in `app/Services/GeoFlow/` alone; `KnowledgeChunkSyncService.php` = 2 685 lines, `DistributionOrchestrator.php` = 1 652 lines, `DistributionTargetSitePackageBuilder.php` > 3 700 lines, `ArticleAiQualityInspectionService.php` > 3 600 lines.

### Runtime components (from `docker-compose.yml`, `docker-compose.prod.yml`, `config/horizon.php`, `routes/console.php`)

| Component | Implementation | Notes |
|---|---|---|
| Web app | `app` container; dev: `php artisan serve` (`docker-compose.yml:74`); prod: `php-fpm -F` (`docker/Dockerfile.prod:155`) behind `nginx:1.27-alpine` (`web`) | Admin UI (Blade + Vite/Tailwind 4 + vditor, "Admin UI V3"), public site, `/api/v1` |
| Database | PostgreSQL with pgvector (`pgvector/pgvector:pg16` dev, `pg18` prod); SQLite for the default test suite (`phpunit.xml`) | `CREATE EXTENSION vector`; `knowledge_chunks.embedding_vector vector(3072)` |
| Cache / locks / queues | Redis 7/8; `CACHE_STORE`, `QUEUE_CONNECTION=redis` | Row locks (`lockForUpdate`) + `Cache::lock` used pervasively |
| Queue workers | `queue` (queues `system-updates,geoflow,distribution,theme-replication,default`), `knowledge-queue`, `ai-quality-queue` (`geoflow:work-ai-quality front`), `ai-quality-backfill-queue`, `ai-optimization-queue`; Horizon supervisors mirror these (`config/horizon.php:207-264`) | Dedicated memory limits per worker; leases + recovery commands for every async pipeline |
| Scheduler | `scheduler` container `schedule:work`; ~20 scheduled commands (`routes/console.php:17-202`): task scheduling every minute, recovery/reconcile jobs, health, pruning | |
| Realtime | Laravel Reverb + laravel-echo/pusher-js; `TaskRealtimeBroadcastService`, `AiWorkspaceRealtimeService`; `routes/channels.php` | Task progress, AI workspace run events, content streaming |
| Updater | Separate project `yaojingang/geoflow-updater` (not in this repo). Core talks to it over a Unix socket (`/run/geoflow-updater/geoflow-updater.sock`) with a control token file (`config/geoflow.php:167-168`); `app/Services/SystemUpdater/*` (`UnixSocketAgentClient`, `CoordinatedAgentProtocol` v2 action plans/receipts, `RemoteUpdaterService` scopes `updater:read/plan/update/backup/restore`, `TufBootstrapVerifier` with bundled `resources/update-trust/root.json`) | Blue/green deployment, backups, rollback, "recovery epochs" (`GuardRecoveryTraffic`, `GuardRecoveryWrites`) |
| CLI | In-repo `app/Console/GeoFlowCli/*` + `bin/geoflow`; standalone PHAR package `packages/geoflow-cli` (`bootstrap.py`, `install.php`, `sign.php`, `release.py`, `publish.py`, `StandaloneInstaller.php`) with GitHub-attested signed bundles (`.github/workflows/cli-candidate|sign|trust|release.yml`) | Profiles, scoped login, receipts (`OperationJournal`), `SecretRedactor` |
| Browser extension | `browser-extension/` Chrome MV3 side panel "GEOFlow Chrome Operator" 0.1.0; device-code pairing; single adapter `src/adapters/zhihu-answer.js` | See section 7 |
| Multi-site | Primary site + "hosted sites" (single-label sub-domains under `GEOFLOW_HOSTED_SITE_ROOT_DOMAINS`; `HostedSiteProfile`, `HostedSiteResolver`, `HostedSiteAllocator`; `ResolveCurrentSite` / `NormalizeRequestHost` middleware) + external distribution channels | Hosted sites are a distribution channel type (`hosted_site`), disabled by default |
| Themes | 27 Blade theme directories in `resources/views/theme/` (`default`, `toutiao-news-20260426` = default theme per `config/geoflow.php:140`, `netease-news-*`, `apple_support_clone`, `geoflow-template-01..21`), `manifest.json` per theme; theme packages import/export (`SiteThemePackageService`), remote theme workspaces (API `management/theme-workspaces/*`), "theme replication" from a reference URL (`Services/Admin/SiteThemeReplication/*`; `ThemeReplicationAgent::generateBlueprint` is a deterministic CSS/JS builder from an HTML analysis, not an LLM call; fetcher uses `SafeOutboundHttpClient`) | |
| AI Workspace | Chat-driven admin agent (`app/Ai/Workspace/*`, `app/Services/AiWorkspace/*`): intent resolution -> plan -> validation -> approval -> capability execution; 19 capability keys (`article.draft`, `distribution.publish`, `visibility.diagnose`, `managed.operations`, ...); state machine with `awaiting_approval` / `awaiting_step_approval`; runtime disabled by default (`GEOFLOW_AI_WORKSPACE_RUNTIME_ENABLED=false`) | NOTICE credits DeepSeek Harness patterns |

### Text diagram

```
                  +---------------------------- GEOFlow Core (Laravel 12 monolith) ----------------------------+
 Admin (Blade) ---| routes/web.php  /{ADMIN_BASE_PATH}/**   [admin.auth, admin.activity, admin.super, throttle] |
 Public site(s) --| routes/web.php  /, /article/{slug}, /category, /archive, /robots.txt, /sitemap.xml, /forms |
 CLI/Skill/Ext ---| routes/api.php  /api/v1/** [api.request_id, api.auth (Sanctum), api.scope:*, api.recovery]  |
                  |                                                                                            |
                  |  Services/GeoFlow: Task worker -> Title gen -> Content gen (laravel/ai) -> Risk gate ->     |
                  |     AI quality gate (3-mode RAG evidence) -> Workflow transition -> Distribution            |
                  |  Services/AiWorkspace: intent -> plan -> approval -> capability handlers                    |
                  |  Services/Outbound: SafeOutboundHttpClient (SSRF policy) for every external HTTP call       |
                  +------+---------------+------------------+------------------+-----------------------------+
                         |               |                  |                  |
                 PostgreSQL+pgvector    Redis         Reverb (WS)      Unix socket -> geoflow-updater (TUF root)
                         |
            Horizon supervisors: default | knowledge | ai-quality | ai-quality-backfill | ai-optimization

   Distribution targets:  WordPress REST | Generic HTTP API | GeoFlow Agent site (generated PHP zip) | Hosted sites
   Manual publication:    Chrome extension (device-code pairing) -> Zhihu adapter -> receipt
   AI providers:          OpenAI / OpenAI-compatible / DeepSeek / Gemini / OpenRouter (chat+embeddings);
                          Doubao Ark + feedcoop web search (AI visibility)
```

## 3. Data model (from `app/Models` and migration names)

| Domain | Models / tables | Meaning |
|---|---|---|
| Identity & access | `Admin` (`role` = `admin` / `super_admin`), `User` (unused Laravel default), `AdminAiSetting`, `AdminAiAccessShadowEvent`, `ApiIdempotencyKey`, `personal_access_tokens` (Sanctum, abilities = scopes) | Two-role model; per-admin AI model ownership/sharing |
| Content pipeline | `Task` (generation task: title/image libraries, prompt, model, `need_review`, `publish_scope`, `distribution_strategy`, `ai_quality_*` policy fields, schedule), `TaskRun`, `TaskSchedule`, `Title`, `TitleLibrary`, `TitleGenerationRun`, `Keyword`, `KeywordLibrary`, `Prompt` (`system_key`, `system_version`), `Article` (`status`, `review_status`, `is_ai_generated`, `ai_quality_policy_snapshot`, `generation_evidence_snapshot`), `ArticleReview`, `ArticleImage`, `Image`, `ImageLibrary`, `ManagedImagePath`, `Author`, `Category`, `ArticleSlugHistory`, `CategorySlugHistory`, `UrlChangeRequest` | Article lifecycle + URL governance |
| Knowledge / RAG | `KnowledgeBase` (content hash, `risk_level`, `review_status`, chunk sync/serving generation, embedding profile), `KnowledgeChunk`, `KnowledgeBaseRevision`, `KnowledgeMediaAsset`, `SystemKnowledgeBase` (admin help), `EnterpriseKnowledgeProject/Revision/Source` (AI-drafted knowledge), `KnowledgeFactLibrary/Revision`, `KnowledgeFact`, `KnowledgeFactValue`, `KnowledgeFactEvidence`, `KnowledgeFactGenerationRun`, pivots `task_knowledge_bases`, `article_ai_quality_knowledge_bases` | Three-layer evidence store (broad text -> chunks -> atomic facts) |
| AI quality & optimisation | `ArticleAiQualityCheck` (score, decision, dimension_scores, issues, uncertainties, snapshots, fingerprints, retrieval mode/basis, gate_reasons, override fields), `ArticleAiQualityCheckSource`, `ArticleAiQualitySegment`, `ArticleAiQualityRollout` (+ events), `ArticleAiOptimizationRun/Step`, `AiQualityAuditEvent`, `ArticleRiskScan`, `SensitiveWord` | Immutable check records keyed by input fingerprint |
| AI models & usage | `AiModel` (encrypted `api_key`, `api_url`, `model_id`, `model_type`, `failover_priority`, `daily_limit`, `used_today`, `total_used`, `max_tokens`, `owner_admin_id`, `access_scope`, `archived_at`, readiness fields), `AiSourceProvider` (search providers: `provider_key`, `endpoint_url`, `api_key`, `daily_limit`), `AiModelUsageEvent` (`input/output/total_tokens`, `estimated_cost`, `request_id`, `call_key`, execution identity), `AiModelUsageAttemptStart` | Ledger with DB-level check constraints/triggers |
| AI visibility | `AiVisibilityRun` (keyword, prompt, provider_type/key, `answer_text`, `raw_request_json`, `raw_response_json`, `latency_ms`, `usage_json`, `analysis_json`), `AiVisibilitySource`, `AiVisibilityCompetitor`, `AiVisibilityCompetitorDetection` | LLM answer probes |
| AI workspace | `AiConversation`, `AiConversationMessage`, `AiWorkspaceRun` (state, plan, digests, leases, `risk_level`), `AiWorkspaceStep`, `AiWorkspaceApproval` (`parameter_digest`, `target_digest`, `expires_at`), `AiWorkspaceArtifact`, `AiWorkspaceExternalOperation`, `AiWorkspaceTraceEvent` | Agentic admin with approvals |
| Distribution | `DistributionChannel` (types `geoflow_agent`, `wordpress_rest`, `generic_http_api`, `hosted_site`; status `active|paused|deleting`), `DistributionChannelSecret`, `DistributionChannelOperation`, `ArticleDistribution`, `DistributionLog`, `HostedSiteProfile`, `HostedSiteArticleAssignment`, `HostedSiteAllocationRequest` | |
| Manual publication | `ManualPublication` (statuses `draft|ready|in_progress|completed|failed|skipped|cancelled|outcome_unknown`, `risk_status`, `disclosure_snapshot`, `identity_snapshot`, `content_fingerprint`), `ManualPublicationPersona`, `ManualPublicationAccount`, `ManualPublicationTransition` | Human-in-the-loop posting to third-party platforms |
| Site & themes | `SiteSetting`, `SiteThemeBinding`, `SiteThemeReplication(+Log,+Version)`, `ThemeWorkspace`, `ThemeRevision`, `ThemeRelease`, `LeadForm`, `LeadSubmission`, `view_logs` (table) | |
| Ops | `SystemState`, `SystemLog`, `SystemUpdateRun`, `SystemUpdateBackup`, `ManagementOperation`, `WorkerHeartbeat`, `UrlImportJob(+Log)`, `AdminActivityLog`, `recovery_preparations`, `recovery_reconciliations` | |

## 4. Knowledge & RAG

**Ingestion.** `KnowledgeSourceParser` accepts manual text plus uploads `txt|md|markdown|docx` (`parseUploadedKnowledgeFile`; docx via ZIP XML with 16 MB XML / ratio-100 zip-bomb guard; 8 MB content cap). No PDF, HTML, CSV or URL crawling into knowledge bases; URL import (`UrlImportProcessingService::process` -> `fetchPage` -> `parseHtml` -> AI "analysis model") targets article drafting, not KBs. `EnterpriseKnowledgeDraftService` + `GenerateEnterpriseKnowledgeDraftJob` let an LLM draft KB content from a project brief.

**Chunking.** `KnowledgeChunkSyncService` (2 685 lines): `prepareStagingSync` -> N x `EmbedKnowledgeChunkBatchJob` (`embedStagingBatch`) -> `finalizeStagingSync` swaps a `generation_key` ("serving generation") atomically; `discardStagingSync`. Strategies (`resolveChunkStrategy`): structured rule chunking (`splitStructuredBlocks`, `MAX_STRUCTURED_LINES=2000`, oversized block splitting, `chunkMaxChars()`) and optional LLM "semantic" chunk planning (`buildSemanticChunks`, <=120 blocks / 20 000 prompt chars, uses a *system* AI identity). Chunks keep `chunk_title`, `section_path`, `chunk_strategy`, `token_count`, `content_hash`, `metadata_json`.

**Embeddings.** `requestEmbeddingVectors` -> `requestOpenAiCompatibleEmbeddings` (OpenAI-compatible `/embeddings`) or Gemini native (`isGeminiEmbeddingMetadata`, `OpenAiRuntimeProvider::resolveEmbeddingDriver`). Vectors stored twice: `embedding_json` and pgvector `embedding_vector vector(3072)` (padded via `padVector`, `embeddingStorageDimensions`). Every chunk and KB carries an *embedding profile* (`embedding_provider`, `embedding_model_id`, `embedding_dimensions`, `embedding_fingerprint`, `embedding_profile_version/digest`; `KnowledgeEmbeddingModelFingerprint`); `assertSingleStagedEmbeddingProfile` rejects mixed profiles; `servingEmbeddingProfileCompatible` guards queries. When no real embedding model is available a deterministic hashed "fallback vector" is stored (`buildFallbackVector`) and flagged (`index_has_no_real_embedding`).

**Retrieval.** `KnowledgeRetrievalService::retrieveEvidence` / `retrieveEvidenceFromMany` / `retrieveContextBundleFromMany`: (1) query embedding via a *compatible* admin-accessible model (`generateCompatibleQueryEmbedding`; on failure logs `geoflow.knowledge_retrieval_embedding_fallback`); (2) pgvector top-K (`fetchPgvectorScores`, `canUsePgvectorSearch`) union keyword prefilter (`fetchKeywordCandidateRows`: `LOWER(content|chunk_title|section_path) LIKE ?`, <=300 rows, <=12 terms); (3) hybrid score `vector*0.45 + lexical*0.35 + title*0.12 + metadata*0.08` (line 383) with CJK bigram tokenisation (`cjkTokens`, `termFrequencies`, `lexicalScore`); (4) `resolveEvidenceConflicts` picks by authority (`review_status` rank, `risk_level` rank, `effective_date`), `shouldExcludeByGovernance`; (5) `composeEvidenceContext` bounded by `knowledge_evidence_limit=8` / 10 000 chars (`config/ai-workspace.php`). No BM25/tsvector, no reranker, no cross-encoder. Fallback is keyword-only.

**Evidence building for quality checks.** Three modes (`App\Support\GeoFlow\AiQualityRetrievalMode`): `atomic_first`, `chunk` (legacy default), `knowledge_broad`. `AiQualityRetrievalReadinessService::inspect` computes per-KB blockers (`knowledge_content_empty`, `knowledge_review_required` for `risk_level=high`, `chunk_sync_not_ready`, `chunk_source_stale`, `chunk_missing`, `atomic_library_not_ready`, `atomic_source_stale`, `atomic_rollout_not_ready`) and the highest available mode. Strategies via `ArticleAiQualityEvidenceStrategyResolver`: `AtomicFirstEvidenceStrategy` (compare claims against the published `KnowledgeFactLibrary` active revision with `AtomicFactComparator`; composite/unsupported claims fall through to chunks; `atomicResultHasPromptInjectionRisk`), `ChunkEvidenceStrategy` -> `ArticleAiQualityEvidenceBuilder::build` (per-claim retrieval, bigram matching `evidenceMatchesClaim`, `aggregateCoverage` -> `full|partial|insufficient`), `KnowledgeBroadEvidenceStrategy` (paragraph windows across front/middle/back regions, budgeted). `KnowledgeEvidenceSecurityInspector::hasPromptInjectionRisk` runs ~30 EN/ZH regexes over evidence text and metadata; positives are quarantined. Evidence cache: `ArticleAiQualityEvidenceCache` (TTL configurable).

**Fact-candidate extraction.** `ArticleFactCandidateExtractor::extract(snapshot, limit=12)`: cleans citation markers, splits sentences on Chinese/ASCII terminators, classifies with regexes: `percentage`, `amount` (yuan/wan-yuan/USD/CNY/$/yen symbols), `date`, `ranking` (first/only/best/national-level in Chinese), `qualification` (licence/certification/ISO), `guarantee` (guarantee/zero-risk/100%), `citation` (according-to ... report/data; quoted spans), `comparison` (higher/lower/YoY in Chinese), `quantity` (Chinese counters). Materiality `high` for the first seven, `medium` otherwise; questions skipped; sorted by materiality -> field rank (title > excerpt > content > keywords > meta) -> offset; ids `F1..Fn`; per-claim `claim_hash` sha256 + `source_hash`. The lexicon is Chinese-first; English coverage exists only via `%`, `$`, `USD`, `ISO` patterns.

**Atomic facts.** `KnowledgeFacts/*`: `KnowledgeFactAiGenerator` (LLM extraction with `KnowledgeFactGeneratorAgent`, batched `GenerateKnowledgeFactBatchJob`, rate-limited by `KnowledgeFactGenerationModelRateLimiter`), `KnowledgeFactStableKeyPolicy`, `KnowledgeFactValuePolicy` (typed values), `KnowledgeFactPublisher` (revision publishing / active revision), `KnowledgeFactEvidenceReconciler`, `AtomicFactComparator` (with `geoflow:validate-atomic-comparator` contract command), rollout gating via `ArticleAiQualityRolloutPolicy` (`atomic_fact_percent`, `atomic_fact_frozen`).

## 5. Content generation

- **Model SDK**: `laravel/ai` ^0.10.3. Agents implement `Laravel\Ai\Contracts\Agent` with `Promptable`, `HasStructuredOutput`, `HasProviderOptions`, `Conversational`, `HasTools`, attributes `#[Timeout]`, `#[Temperature]`, `#[MaxTokens]`; runtime providers are registered dynamically per model row (`OpenAiRuntimeProvider::registerProvider`, name `runtime_<slot>_<md5(driver|url|key)>`).
- **Agents** (`app/Ai/Agents/`): `MarkdownContentWriterAgent` (Chinese system instruction "you are a professional article-writing assistant..."; timeout 240 s; injects `max_tokens` / `max_output_tokens` / `maxOutputTokens` per provider), `TitleGeneratorAgent`, `ArticleQualityReviewerAgent` (structured schema: `summary`, `promotion_context in informational|promotional|mixed|uncertain`, `reviewed_claim_hashes`, `issues[]`, `uncertainties[]`, `truncated_issue_count`), `ArticleQualityJsonReviewerAgent`, `LegacyArticleQualityReviewerAgent`, `ArticleOptimizationRefinerAgent` / `ArticleOptimizationJsonRefinerAgent`, `KnowledgeFactGeneratorAgent`, `IntentResolverAgent`, `GeoHubAgent`, `GeoHubPlanDrafterAgent`, `TaskCreationAssistant`, `AdminHelpAssistant`.
- **Generation service**: `ArticleContentGenerationService::generate|stream|deferredStream|deferredStreamWithReservation` wraps the agent, reserves daily quota (`AiUsageQuotaService`), streams `TextDelta` events through `ArticleContentStreamSession` (Reverb broadcast to the editor), normalises output (`OpenAiRuntimeProvider::normalizeGeneratedText`, SSE-leak detection), strips reasoning (`ArticleReasoningFilter`, MiniMax) and citation markers (`ArticleCitationMarkerCleaner`, `geoflow:clean-citation-markers`).
- **Prompting**: `ArticleContentPromptRenderer::renderForWorker|renderForEditor` — template variables, appended knowledge context, English-vs-Chinese heuristic (`isLikelyEnglishPrompt`), final instruction and attribution rule; prompts are DB rows (`Prompt` with `system_key/system_version`, admin-editable). Quality prompts: `ArticleAiQualityPromptRenderer` (variables projected for the model, removed-rule filtering) + `ArticleAiQualityPrincipleCompiler` (`VERSION = article-quality-principles-2.1.0`, universal vs specialised rule ids, deprecations).
- **Title generation**: `TitleGenerationCoordinator` / `TitleAiGenerationService` / `ProcessTitleGenerationBatchJob` with per-admin/IP submit limits (6/min, 12/min), batch size 50, 30 req/min, leases and recovery (`geoflow:recover-title-generations`).
- **Worker pipeline**: `ProcessGeoFlowTaskJob` -> `WorkerExecutionService` (pick title from library -> render prompt -> retrieve knowledge context -> generate -> images via `ManagedImageFileService` -> `ArticleWorkflowTransitionService` -> distribution). `TaskActivationGuard`, `TaskLifecycleService`, `WorkerHeartbeat`, `WorkerAiModelInvocationGateway`.
- **Optimisation refiners**: `ArticleAiOptimizationCoordinator` + `LaravelArticleAiOptimizationRefiner::refine` (JSON patch edits validated by `ArticleAiOptimizationPatchValidator`, bounded by `GEOFLOW_AI_QUALITY_OPTIMIZATION_MAX_ROUNDS` / `MAX_EDIT_CHARACTERS`), targets pass / 80 / 90 (`ai_quality_optimization_level`), candidate re-scored as `evaluation_mode=optimization_candidate`, apply/cancel/rollback endpoints (`routes/api.php` `articles/{article}/ai-quality/optimization/*`).

## 6. AI quality gates & publication workflow

**Composition.** `ArticlePublicationQualityGate::check` = `ArticleRiskGate::check` (deterministic) then `ArticleAiQualityGate::check` (LLM). Called from `ArticleWorkflowTransitionService::transition`, which locks task -> article (`lockTaskBeforeArticle`, `lockArticleAfterTask`), normalises the requested state, and on gate exception optionally applies a rejected state or forces `private` for `publish_scope=distribution_only`.

**Workflow states** (`App\Support\GeoFlow\ArticleWorkflow`): `status in draft|published|private`, `review_status in pending|approved|rejected|auto_approved`; `normalizeState` forces `draft` when pending/rejected and `published` when `auto_approved`; `PUBLISHABLE_REVIEW_STATUSES = [approved, auto_approved]`. `Task.need_review` (= `manual_review_required`, default true) decides whether the worker auto-approves.

**Risk gate.** `ArticleRiskScanner` (`SCAN_ALGORITHM_VERSION='4'`): sensitive-word dictionary (`SensitiveWord`, <=1 000 active rules, cached 1 h) matched after NFKC folding / separator stripping over title, excerpt, content, keywords, meta; produces `ArticleRiskScan` with `status in clean|warning|blocked`, content hash + dictionary hash for freshness (`isFresh`). `ArticleRiskGate`: `clean` passes; `warning` passes only if already overridden or an admin supplies a normalised non-empty reason (recorded with admin id/username/time); `blocked` always throws `ArticleRiskGateException`.

**AI gate logic** (`ArticleAiQualityGate::checkLocked`): (1) blocks while an optimisation run is active/stale/needs_review/failed unless the trigger is an explicit override (`admin_ai_quality_override`, `api_ai_quality_override`); (2) `ArticleAiQualityPolicyResolver::resolve` -> `required`, `pass_score` (default 85), `manual_override_min_score` (default 70), `timeout_sampling_enabled`, `manual_review_required`, model candidates (<=2 via `ai_quality_max_model_candidates`); (3) computes `currentFingerprint` (article snapshot + policy + rules + version selection) and compares with the latest `gate_applied` check; mismatch or `retrievalBasisMatches` false => mark `stale`, create replacement (`createOrReuse(force: true)`), throw `article_ai_quality_stale`; (4) `queued|running` => `article_ai_quality_pending`; `failed|error` => `article_ai_quality_failed`; (5) sampled-fallback checks (`inspection_scope=fallback_sampled`) may only authorise when `sampledResultCanAuthorize` (policy snapshot equals current sampling config, `safe_for_auto_release`, all mandatory claims covered, regions front/middle/back, deterministic risk not blocked, score >= pass, no gate reasons); (6) `decision=passed` => pass; `needs_review` => pass only if overridden already, or admin + reason (>=4 chars, <=1 000) + `score >= manual_override_min_score`; otherwise throw `article_ai_quality_blocked`.

**Scoring** (`ArticleAiQualityScorerV2::score`): dimensions `knowledge_consistency 35`, `data_traceability 25`, `advertising_compliance 30`, `content_integrity 10` (sum 100); per-issue deductions by severity (e.g. knowledge critical -20, advertising critical -20, high -12, ...); `gate_reasons` from `evidence_coverage_partial|insufficient`, `high_materiality_uncertainty`, `unverified_material_claim`, `claim_coverage_incomplete`, `model_output_truncated`, `unresolved_reference`, `confirmed_hard_blocker`, `confirmed_high_severity_issue`; decision `blocked` if hard blocker or `score < manual_override_min`, `needs_review` if `score < pass` or any gate reason, else `passed`; also returns `confidence`. V1 scorer (`ArticleAiQualityScorer`) retained.

**Rule/algorithm versioning & rollout.** `ArticleAiQualityVersionPolicy::selection(articleId)` buckets (sha256 of workspace+article+experiment mod 100) against `ArticleAiQualityRolloutPolicy` percentages for `principles-v2`, `fast-v2` execution, `scoring-v2`, `shadow-v2`; emits `algorithm_version` like `exec=f2;ret=4;principles=2;prompt=2;score=2`. Rollout state persisted in `article_ai_quality_rollouts` with epochs (`rolloutEpochMatches`, `invalidateRolloutEpoch`) and the `geoflow:ai-quality-rollout` command. `ArticleAiQualityCheck` stores `algorithm_version`, `scoring_version`, `retrieval_strategy_version`, `prompt_hash`, `knowledge_hash`, `input_fingerprint`, `retrieval_basis_hash`, plus snapshots of article, fact candidates, evidence, prompt template, advertising rules, model, raw model output.

**Expiry / invalidation.** `ArticleAiQualityInvalidationService`: `invalidateArticle(s)`, `invalidateTask`, `invalidateKnowledgeBase`, `invalidatePrompt`, `invalidateModel`, `invalidateRolloutEpoch`, `invalidateSampledTaskChecks`, `cancelArticle(s)`, optimisation cancel/invalidate; scheduled `geoflow:reconcile-ai-quality` (every minute), `geoflow:converge-ai-quality`, `geoflow:ai-quality-health --json`. Deadlines: `ai_quality_deadline_seconds` 180, request timeout 160, sampled fallback after 45 s.

**Execution.** `ArticleAiQualityInspectionService` (`createOrReuse`, `process`, `tryStartSampledFallback`, `markFailed`, `recoverStuckCheck`, `applyCompletedWorkflow`) on dedicated queues (`ai-quality`, `ai-quality-backfill`) with `ArticleAiQualityProviderCircuitBreaker`, `AiUsageQuotaService`, `ArticleAiQualityWorkerLiveness`, segmentation for long articles (`ArticleAiQualitySegmenter`, `ArticleAiQualitySampleBuilder`).

**Human approval points (explicit).** (a) Task `need_review` -> article stays `pending` until an admin approves via UI or `POST /api/v1/articles/{id}/review` (`articles:publish`); (b) risk-warning override with reason; (c) AI-quality manual release (`/ai-quality/override`, admin UI) with audited reason, only above `manual_override_min_score`; (d) optimisation candidate apply/rollback; (e) AI Workspace `awaiting_approval` / per-step approvals (`AiWorkspaceApproval` with `parameter_digest`, `target_digest`, expiry); (f) URL-change typed confirmation and channel two-step deletion (super admin); (g) updater actions require password re-auth and a saved plan.

## 7. Distribution

- **Contract**: `DistributionPublisherInterface { health, publish, update, delete, syncSiteSettings }`; `DistributionPublisherManager` selects by `channel_type`; `DistributionPayloadBuilder` builds the article payload; `DistributionOrchestrator` handles enqueue (`enqueueForArticle(Targets)`), claim (`claimForProcessing` with leases), `process`, `reconcileUnknownOutcome`, retries (`DistributionRetryPolicy`), channel refresh, deletion safety (`DistributionChannelOperationLeaseService`, `DistributionChannelDeletionService` two-step with impact fingerprint), `DistributionLog`.
- **WordPress REST** (`WordPressRestPublisher`): `/wp/v2/users/me` health, `/wp/v2/posts` create/update (reuses remote post id; reconciles by slug on timeout), `/wp/v2/posts/{id}` trash, `/wp/v2/settings` sync, media (`WordPressMediaSyncService`) and taxonomy sync (`WordPressTaxonomySyncService`); auth via channel secret.
- **Generic HTTP** (`GenericHttpApiPublisher` + `GenericHttpEndpointResolver`, `GenericHttpRequestFactory`, `GenericHttpResponseMapper`): configurable endpoint/method/headers/body mapping and response-id extraction (`channel_config`).
- **GeoFlow Agent sites** (`GeoFlowAgentPublisher` + `DistributionTargetSitePackageBuilder`): generates a self-contained PHP "agent" site zip (static/rewrite front modes, Apache/Nginx/BaoTa fallbacks, `llms.txt`, `sitemap.txt`, `robots.txt`, JSON-LD, capability endpoint `/geoflow-agent/v1/frontend-capabilities`); requests signed with HMAC-SHA256 over `method\npath\ntimestamp\nnonce\nbodyHash` (`DistributionSigningService`; headers `X-GEOFlow-Key-Id|Timestamp|Nonce|Idempotency-Key|Body-SHA256|Signature|Event`).
- **Hosted sites** (`HostedSitePublisher`, `HostedSiteAllocator`): first-party sub-domain sites in the same DB with per-profile `daily_publish_limit` (default 3), `min_publish_interval_minutes` (360), `min_articles_before_index` (10), content-fingerprint de-duplication (unique index), cooldown after failures, technical probe/preflight.
- **Manual publication + Chrome extension**: admins create `ManualPublication` work orders (platform, target URL, persona/account, content, `risk_status` via risk scanner, `disclosure_snapshot`, duplicate detection). Extension pairing is OAuth-device-flow-like: `POST /api/v1/browser-operations/device-authorizations` (throttle 5/min) returns `device_code`/`user_code`; admin approves in `account/browser-clients`; extension polls `device-token`; resulting Sanctum token has `browser-operations:read|execute`. Protocol header `X-GEOFlow-Browser-Protocol: 1` (`EnsureBrowserOperationsProtocol`), recovery-epoch header, idempotency key. Endpoints `manual-publications/{id}/claim|heartbeat|release|receipt`. Only adapter: Zhihu answers (`zhihu-answer.js`); URL policy allows HTTPS or loopback HTTP only; `PRIVACY.md` states cookies/passwords/DOM are never sent.

## 8. SEO / GEO features

| Feature | Where generated | Detail |
|---|---|---|
| `<title>`, meta description, keywords, canonical | `resources/views/site/partials/seo-head.blade.php` | Canonical from permalink generator; `<meta name="robots" content="noindex, nofollow">` when `$siteIndexingAllowed` is false (hosted sites below `min_articles_before_index`) |
| Open Graph | same partial | `og:title`, `og:description`, `og:type` (`website` / page-specific), `og:url`, `og:site_name`. **No `og:image`, no Twitter cards, no `hreflang`, no `article:published_time`** (grep over `resources/views/site` and the ink-editorial theme found none) |
| Schema.org JSON-LD | `resources/views/components/json-ld.blade.php` (`Js::encode`) fed by page-level `@php` arrays: `article.blade.php` -> `Article` with `author` `Person`, `publisher` `Organization`, `datePublished`, `dateModified`, `mainEntityOfPage`; `home.blade.php` -> `WebSite`; `about.blade.php` -> `AboutPage` | Agent-site package builder additionally emits `BreadcrumbList`, `CollectionPage`, `ListItem`, `WebSite`, `Organization`, `Person` (`DistributionTargetSitePackageBuilder.php:3060-3340`). No `FAQPage`, `HowTo`, `Product`, `Organization` sameAs/knowledge-graph fields on the primary site (the `apihot-recommend` demo theme mentions ItemList/SoftwareApplication/FAQPage in copy only) |
| robots.txt | `SiteDiscoveryController::robots` | `User-agent: *` + `Allow: /` + `Sitemap:` or `Disallow: /`; no per-crawler rules (no GPTBot/ClaudeBot directives) |
| sitemap.xml | `SiteDiscoveryController::sitemap|sitemapShard`, `SitemapManifest` (cached, lock-built, 50 000 URL limit, `BuildSitemapManifest` job) | Index + shards, streamed responses, hosted-site aware |
| llms.txt | **Only for GeoFlow Agent target sites**: `DistributionTargetSitePackageBuilder::initialLlmsText` (site name, description, home, `sitemap.txt`, article list) and a runtime `/llms.txt` handler inside the generated PHP (`:3744`) | **The primary Laravel site does not serve `/llms.txt`** (no route in `routes/web.php`; `ArticlePermalinkPattern` merely reserves the slug). The About page copy claims llms.txt support. |
| Permalinks / redirects | `App\Support\Site\ArticlePermalinkPattern|Policy|Service`, `ArticleSlugHistory`, `CategorySlugHistory`, `UrlChangeService` | Six presets + constrained custom patterns; legacy URL 301s; URL-change risk workflow |
| PWA | `<x-pwa-head />` on primary site | manifest + `resources/js/pwa.js` |
| AI-generated disclosure | `Article.is_ai_generated` column exists | **Not rendered anywhere in public views** (grep found no usage in `resources/views/site` or `theme/default`) |

## 9. Analytics & AI visibility

- **Traffic**: `RecordSiteViewLog` middleware writes `view_logs`; `App\Support\Analytics\TrafficClassifier` buckets user agents into `human | search_bot | ai_bot | other_bot | unknown` with lists incl. `gptbot`, `oai-searchbot`, `claudebot`, `claude-searchbot`, `anthropic`, `perplexitybot`, `ccbot`, `applebot-extended`, `youbot`, `googlebot`, `bingbot`, `yandexbot`, `duckduckbot`, `semrushbot`, `ahrefsbot`, generic `bot|crawler`. This is the only "AI crawler analytics"; there is no log-file ingestion, no per-bot allow/deny, no crawl-budget view.
- **Admin analytics** (`Services/Admin/Analytics/*`): `AnalyticsOverviewService` (`globalOverview`, `kpis`, `publicationTrend`, `taskTrend`, `contentFunnel`, `distributionSummary`, `topContent`, `aiUsageSummary`, `categoryDistribution`, `performanceStats`, `taskHealth`, `materialHealth`, `aiHealth`, `urlImportHealth`), `DistributionAnalyticsService`, `LeadAnalyticsService`, `GrowthOverviewService`, `AnalyticsLogQueryService`; AI Workspace daily/weekly report capabilities.
- **AI visibility — does it probe LLMs? Yes.** `AiVisibilityService`:
  - `runDoubaoArkResponses` -> `DoubaoArkResponsesClient::answerWithWebSearch` posts to the model's Ark Responses endpoint (`/responses`, ByteDance Volcengine) with `tools: [{type: web_search}]`;
  - `runDoubaoSearchCustom` -> `DoubaoSearchCustomClient::search` posts to `https://open.feedcoopapi.com/search_api/web_search` (`AiSourceProvider` `doubao_search_custom`);
  - `runDeepSeekAnalysis` -> `DeepSeekAnalysisClient::analyze` (chat completion; prompt + search sources appended in Chinese "available sources are...");
  - `runDoubaoSearchThenDeepSeekAnalysis` chains both; `runCompetitorDetection` asks the model to list competitors (`AiVisibilityCompetitorParser`).
  - Every run is persisted as `AiVisibilityRun` with raw request/response, latency, usage; results normalised by `AiVisibilityResultNormalizer`; competitor stats via `AiVisibilityCompetitorReportService::stats`, trends via `AiVisibilityAnalyticsService::snapshot|overview`; bulk keyword collection via `CollectAiVisibilityKeywordJob` / `geoflow:collect-ai-visibility`, detection via `DetectAiVisibilityCompetitorsJob`.
  - `AiProviderEndpointPolicy::MODEL_HOSTS = ['ark' => ['volces.com'], 'deepseek' => ['deepseek.com']]` — HTTPS host allow-list. **Providers are exclusively Chinese (ByteDance Doubao/Ark, DeepSeek, feedcoop search).** There is no probing of ChatGPT, Perplexity, Google AI Overviews, Gemini, Claude, Copilot, or any EU-hosted model; no share-of-voice model across engines; no citation-URL extraction against the site's own URLs beyond source lists.
- **Quota/limits**: `AiSourceProvider.daily_limit`, `AiUsageQuotaService::reserveProvider`.

## 10. AI model abstraction

- **SDK**: `laravel/ai` ^0.10.3 (Laravel first-party, pre-1.0). Used contracts: `Agent`, `Promptable`, `HasStructuredOutput`, `HasProviderOptions`, `Conversational`, `HasTools`, `Lab` enum, `StreamableAgentResponse`/`TextDelta`, `FailoverableException`, `InsufficientCreditsException`.
- **Provider resolution** (`App\Support\GeoFlow\OpenAiRuntimeProvider`): driver derived from `api_url`/`model_id` — `gemini` (Google native), `openai` (`api.openai.com`), `deepseek` (`api.deepseek.com` or model prefix), `openrouter` (line 96), else `openai-compatible`. Embedding driver: `gemini | openai | openai-compatible`. **No Anthropic driver** (the only `'anthropic'` string in `app/` is a crawler UA in `TrafficClassifier`), no Azure OpenAI, no Mistral, no Ollama-specific handling (works only if OpenAI-compatible). Chat endpoints normalised to `/chat/completions`; OpenAI `/responses` supported for `api.openai.com`.
- **Model records**: `AiModel` rows are admin-managed (any URL + key), `access_scope` `user_content` vs `system_only`, ownership + sharing (`AdminAiSharingService`, access versions, shadow reports), readiness probes for AI Workspace (`AiWorkspaceModelCapabilityProbe`, `ai_workspace_structured_output_status`), `AiModelReferenceCatalog` (tracks where models are referenced).
- **Failover**: `AiModelFailoverDecider` — 4xx except 408/425/429 = permanent (no failover); 5xx/408/425/429/transport = failover; `Task.model_selection_mode` + `failover_priority`; quality checks take <=2 candidates (`ArticleAiQualityPolicyResolver::modelCandidates`); AI visibility `isTransientProviderFailure`.
- **Quota**: `AiUsageQuotaService::reserveModel|reserveProvider` — row-locked daily counters (`daily_limit`, `used_today`, `usage_date`), reservation objects released/recorded; AI Workspace `admin_daily_model_calls` (200/day/admin) and `global_concurrency` (10) in Redis; title-generation and knowledge-fact rate limiters.
- **Circuit breaker**: `ArticleAiQualityProviderCircuitBreaker` (cache-based: `consecutive_failures` threshold, failure-percent over sample window, `open_seconds`, half-open single probe) — applies to AI-quality calls only.
- **Usage ledger**: `AiModelUsageRecorder` -> `ai_model_usage_events` (`input_tokens`, `output_tokens`, `total_tokens`, `estimated_cost` decimal, `request_id`, `call_key`, `operation`, `execution_scope`, `model_source`, `business_source`, config-owner and executing admin ids, `ai_config_access_version`), immutable attempt-start ledger (`ai_model_usage_attempt_starts`) with DB triggers (`AiModelUsageLedgerSchema`), reconciliation command every 5 min. Cost is "estimated" (no price table found in `config/`).
- **Provider data-policy / region / training-usage metadata: ABSENT.** Explicit check: grep for `data_policy|region|residency|training|zero.retention|gdpr|dpa` across `app/Models/AiModel.php`, `app/Services/Admin/AiModelReferenceCatalog.php`, `app/Support/GeoFlow/OpenAiRuntimeProvider.php`, `config/geoflow.php` and the `ai_models` migrations returned nothing. The schema has no columns for provider jurisdiction, hosting region, data-retention terms, training opt-out, DPA reference or model card; `AiSourceProvider.metadata_json` is free-form. Model choice is purely URL/key.

## 11. Security

**Authentication.** Admin web guard (`AuthenticateAdminWeb`, session, `GEOFLOW_SESSION_TIMEOUT`, remember-me minutes); login throttle `admin-login` + `AdminLoginLockService` (5 attempts / 900 s per username+IP in cache; `admins.status=locked` manual lock; `geoflow:unlock-admin`). API: `AuthenticateApiToken` — Bearer Sanctum personal access tokens (`ApiTokenService::getActiveTokenByPlaintext`, TTL default days, `touchToken`), token bound to `created_by_admin_id`. **No MFA/TOTP/WebAuthn, no SSO/OIDC/SAML** (grep = 0 hits). Browser extension tokens via device flow.

**RBAC / scopes.** Two roles only: `admin` and `super_admin` (`Admin::canManageProtectedWorkflows`, `EnsureSuperAdmin`). Token scopes: `catalog:read`, `tasks:read|write`, `jobs:read`, `articles:read|write|publish`, `materials:read|write`, `browser-operations:read|execute`, management `sites:read`, `themes:read|write|code`, `updater:read|plan|update|backup|restore` (`ManagementScopePolicy` requires active super admin); `*` wildcard allowed only for non-management scopes. Super-admin-only areas: distribution, hosted sites, system updates, settings, AI source providers, sensitive analytics, URL changes, channel deletion. No per-site / per-tenant / per-KB permissions; AI model ownership/sharing is the only object-level ACL.

**CSRF.** Laravel default web middleware group; `bootstrap/app.php` registers no `validateCsrfTokens(except: ...)` exemptions (grep). API routes are token-only (stateless).

**SSRF / outbound.** `App\Services\Outbound\SafeOutboundHttpClient` + `FinalOutboundSecurityPolicy` + `SystemHostResolver` + `SecureHttpFactory` wrap every external call (distribution, WordPress, URL import, theme reference fetch, AI visibility HTTP client factory, update metadata, updater bootstrap). Controls: URL normalisation (`invalid_scheme`, `userinfo_forbidden`, `fragment_forbidden`, `control_character`, `ambiguous_authority`, `ambiguous_ip`), DNS resolution (A/AAAA, CNAME chase with depth) and rejection of private/loopback/link-local/mapped addresses (`unsafe_address`, `mapped_address`) unless listed in `GEOFLOW_OUTBOUND_PRIVATE_TARGETS`; IP pinning via `CURLOPT_RESOLVE`; transport `allow_redirects=false` with manual redirect following (<=3) re-validated per hop and optional validator; per-class response caps (`outbound_json_max_bytes` 4 MB, `outbound_ai_max_bytes` 8 MB, `outbound_import_max_bytes` 5 MB, `outbound_metadata_max_bytes` 1 MB, global 50 MB) enforced on headers and streamed bodies; timeouts capped. Skill preflight script mirrors this (HTTPS-only for non-loopback, 5 MB cap, 20 s). Tests: 6 files reference the outbound client.

**Request-size limits.** `LimitArticleMarkdownExportRequestSize` (413), theme change batch 1 MiB / file 5 MiB (`ThemeWorkspaceService`), theme packages 500 files / 25 MB, knowledge 8 MB, uploads `GEOFLOW_MAX_UPLOAD_BYTES`, AI workspace char budgets. No global JSON body limit beyond PHP/nginx defaults.

**Secrets.** `AiModel.api_key` and channel secrets encrypted with `ApiKeyCrypto` — AES-256-CBC via `openssl_encrypt`, key material = `APP_KEY` only (`config('geoflow.api_key_crypto_roots')`), format `enc:v1`; no HMAC/AEAD (unauthenticated CBC), no KMS/HSM, rotation only by listing multiple roots. `.env.example` seeds `GEOFLOW_ADMIN_PASSWORD` (empty), `REVERB_APP_SECRET`, `DB_PASSWORD`, `REDIS_PASSWORD`, `MAIL_*`, `AWS_*`. Redaction: `LogAdminActivity` strips password fields; CLI `SecretRedactor`; `AiExecutionErrorSanitizer`, `DistributionErrorSanitizer`, `AiWorkspaceErrorSanitizer`; API keys masked in UI (`ApiKeyCrypto::mask`).

**Telemetry defaults.** `GEOFLOW_TELEMETRY_ENABLED=false`, `GEOFLOW_TELEMETRY_ENDPOINT=` (empty) — `AnonymousUsageTelemetry` sends only `instance_id` (uuid), HMAC `user_hash`, `version` when both are set. **But** `GEOFLOW_UPDATE_CHECK_ENABLED=true` by default: Core fetches `https://github.com/yaojingang/GEOFlow/releases/latest/download/version.json` (24 h cache) and the updater bootstrap manifest from `github.com/yaojingang/geoflow-updater` — an outbound call to GitHub from every production instance.

**Updater trust model.** TUF-style: bundled `resources/update-trust/root.json` (root v1, expires 2028-08-26, 6 ed25519 keys, thresholds root=2, targets=1, snapshot=1, timestamp=1); `TufBootstrapVerifier::verify` checks exact key sets, role thresholds, expiry, manifest schema (`assets`, `expires`, `release_sequence`, `schema_version`, `updater_version`); 100 MB bootstrap cap. Runtime control: Unix socket + control token file; every mutating action needs an authorization code (`#[SensitiveParameter]`) and, by default, admin password re-auth (`update_require_admin_password`); v2 coordinated protocol with action plans, admission receipts, request IDs, recovery epochs that invalidate old credentials (`GuardRecoveryTraffic`, `GuardRecoveryWrites`, `RecoveryState`). CLI bundles verified with `gh attestation verify` against `cli-sign.yml` (docs in `packages/geoflow-cli/DISTRIBUTION.md`, Chinese).

**Security audit service.** `SecurityAuditService::audit` (`geoflow:security-audit`) reports 20 finding codes — idempotency-row integrity (`IDEMPOTENCY_*`), managed-image registry state (`MANAGED_REGISTRY_*`, `IMAGE_*`), `LEGACY_IMAGE_PATH_INPUT_ENABLED`, `OUTBOUND_PRIVATE_TARGETS_CONFIGURED`, schema completeness. It is a data-integrity/config posture check, not a vulnerability scanner.

**Other.** `KnowledgeEvidenceSecurityInspector` (prompt-injection regexes, EN/ZH). Idempotency keys with v2 fingerprints (`IdempotencyService`). Named rate limiters: `admin-login`, `admin-sensitive`, `api-ai-quality-manual`, `article-markdown-export-*`, `ai-workspace*`, `site-lead-submission`, `title-generation*`, `knowledge-fact-generation`. CSP headers exist only on preview iframes (`SiteThemePreviewController`, `ThemeWorkspacePreview`, `ThemePreviewRenderer`, knowledge media) — **no site-wide CSP/HSTS** (nginx config not inspected for HSTS). Frontend uses DOMPurify for markdown rendering. CI runs `composer audit`, `npm audit --audit-level=high`; no SAST.

**Strengths.** Rigorous SSRF client; lease/lock discipline; immutable audit ledgers for AI usage; scoped tokens; super-admin gating of destructive paths; TUF-anchored updater; secret redaction; prompt-injection quarantine; extensive concurrency tests.

**Gaps (for an EU governance-first product).** No MFA/SSO; two-role RBAC with no tenant/site/KB scoping; unauthenticated AES-CBC for provider keys with APP_KEY as sole root; default outbound update check; no CSP/HSTS policy in app; security audit limited to integrity; no SBOM/SAST/container scanning; 44 files carry "All rights reserved" headers (see section 18); admin path obscurity (`ADMIN_BASE_PATH`) used as a control; no secrets manager integration.

## 12. Governance / compliance

| Capability | Exists? | Evidence |
|---|---|---|
| Admin activity log | **Yes** | `App\Models\AdminActivityLog` (`admin_id`, `admin_username`, `admin_role`, `action`, `request_method`, `page`, `target_type`, `target_id`, `ip_address`, `details`); `LogAdminActivity` middleware records POST/PUT/PATCH/DELETE only, redacts password fields, adds AI-workspace / knowledge-fact / theme-package summaries; `AdminActivityLogger::logFromRequest` |
| AI decision audit | **Yes (partial)** | `ArticleAiQualityCheck` snapshots + `AiQualityAuditEvent`; `AiWorkspaceTraceEvent`; `ai_model_usage_events` ledger; `ManagementOperation` receipts; `DistributionLog`; `SystemLog`; `UrlImportJobLog` |
| Retention policies | **Partial, feature-local** | AI workspace `retention_days` 90 (`geoflow:prune-ai-workspace` daily), knowledge-fact generation runs 90 days, article exports pruned hourly, task trash prune; **no retention for `view_logs`, `lead_submissions`, `admin_activity_logs`, `ai_visibility_runs` (raw prompts/answers kept indefinitely)** |
| Data export | **Partial** | Articles -> Markdown zip via signed URL (`ArticleMarkdownExportService`), WeChat HTML export, theme package export; `LeadController` has an export action; no whole-tenant export, no machine-readable audit export |
| Data subject rights (access/erasure/portability) | **No** | No DSR tooling; lead deletion only as admin CRUD |
| Consent management | **No** | Lead forms (`LeadFormFields`) have no consent/privacy field; no cookie banner |
| DPIA / RoPA / processing register | **No** | No docs or code (`grep -i gdpr|dpia` over `app/`, `config/`, `docs/` = 0 hits) |
| EU AI Act transparency (AI-generated labelling) | **No** | `Article.is_ai_generated` exists but is never rendered publicly; `ManualPublication.disclosure_snapshot` is a per-platform disclosure text for manual posts only |
| Provider/data-residency governance | **No** | See section 10 |
| Model risk / rule versioning | **Yes** | Principle compiler version, algorithm version, rollout epochs, immutable snapshots (section 6) |
| Privacy notice | **Extension only** | `browser-extension/PRIVACY.md` |
| Licence/CLA governance | **Yes** | `LICENSE`, `NOTICE`, `CLA.md`, `CONTRIBUTING.md`, PR declaration |

## 13. Observability

- **Request IDs**: `AssignApiRequestId` — accepts/validates `X-Request-Id` (`^[A-Za-z0-9._:-]{1,128}$`) or generates a UUID; echoes it on the response; logs `geoflow.admin_forbidden` on admin 403s. Applied to `/api/v1/*` only (not to admin web or public routes). Request IDs also flow into `ai_model_usage_events.request_id`, management operations and CLI receipts.
- **Logging**: standard Laravel channels (`stack`, `single`, `daily`, `slack`, `papertrail`, `stderr`, `syslog`, `errorlog`, `emergency`); structured `Log::info/warning` with `geoflow.*` event names in hot paths; `SystemLog` table for app-level events; `DistributionLog`.
- **Metrics**: Horizon dashboard (guarded `admin.auth`, `admin.super`), `horizon:snapshot` every 5 min, `HorizonMetricsAdapter::queueOverview`, `geoflow:ai-quality-health --json` each minute, `ArticleAiQualityHealthService`, `WorkerHeartbeat` + `ArticleAiQualityWorkerLiveness`, `AiWorkspaceGovernanceMetrics::snapshot` (durations, usage, client `first_render_ms`/`reconnect_count`). **No Prometheus/OpenTelemetry exporter, no tracing spans, no external APM hooks.**
- **Cost tracking**: `ai_model_usage_events.estimated_cost` + tokens per call with execution identity; `AnalyticsOverviewService::aiUsageSummary`; `AiVisibilityRun.latency_ms` / `usage_json`. No per-tenant budgets, no price catalogue, no alerting.

## 14. Tests & CI

**Counts (measured).**

| Suite | Files | Test methods | Runner / DB |
|---|---|---|---|
| `tests/Unit` | 124 | 709 | PHPUnit 11, SQLite in-memory, `QUEUE_CONNECTION=sync`, `CACHE_STORE=array` |
| `tests/Feature` | 201 (194 top-level + `HostedSites/` 7) | 2 669 | same |
| `tests/PostgreSQL` | 13 (+ base case) | 27 | `phpunit.postgresql.xml` against `pgvector/pgvector:pg18` — concurrency, lease recovery, embedding profile queries, URL-change ordering |
| `tests/Performance` | 1 | 1 | `ArticlePermalinkScaleTest` |
| `tests/JavaScript` | 30 | 208 `test()/it()` | `node --test` (no browser) |
| `tests/Browser` | 0 | 0 | directory exists, empty — no Playwright/Dusk |
| Skill evals | `evals/test_geoflow_scripts.py` | 39 | Python unittest; script safety (symlinks, HTTPS, redaction, installer) |
| CLI package | `packages/geoflow-cli/tests` | 24 py + `ReleaseInstallerTest.php` | distribution/release gates |

Targeted coverage: outbound/SSRF 6 files, gates 8, retrieval/chunking 12, AI visibility 11, telemetry 2, TUF 2, prompt-injection inspector 1, security audit 1. Test names and assertion messages are frequently Chinese (161/348 test files contain CJK).

**CI (`.github/workflows/ci.yml`, actions pinned by SHA, `permissions: contents: read`).** Job `application` (PHP 8.4, Node 22): `composer validate --strict`; `pint --test`; `php scripts/export-management-coverage.php --check` (route/operation coverage drift vs `docs/api/management-coverage.json`); CLI lock validation; skill Python evals; `npm run build`; `composer test`; CLI smoke install; `npm run test:analytics` (all JS tests); `composer audit --locked`; `npm audit --audit-level=high`. Job `postgresql`: pgvector pg18 service + `phpunit.postgresql.xml`. Separate manual workflows: `cli-candidate.yml` (immutable candidate), `cli-sign.yml` (attestation), `cli-trust.yml` (trust bundle), `cli-release.yml`, `cli-check.yml` (PR path-filtered).

**Not present**: static analysis (no PHPStan/Psalm/Larastan in `composer.json`), coverage thresholds (`coverage: none`), SAST/CodeQL/semgrep, container/image scanning, secret scanning config, dependency-review action, E2E browser tests, accessibility tests, Lighthouse.

## 15. The `geoflow` Agent Skill (`.agents/skills/geoflow/`)

**Structure (63 required files per `evals/expected_artifacts.json`).** `SKILL.md` (32 lines, English, frontmatter `name`/`description`), `README.md`, `manifest.json` (version `1.2.0-preview.1`, owner "Yao Team", `target_platforms: openai, claude, agent-skills, vscode, generic`, `supersedes: yao-geoflow-cli|design|template`, `mode_maturity`: operations stable, others beta), `agents/openai.yaml` + `agents/interface.yaml` (display name, default prompt, adapter/degradation policy, `remote_inline_execution: forbid`), `references/` (22 md files: remote-cli-workflow, remote-updater-workflow, operation-boundary, command-map, development-workflow, system-capability-discovery, theme-* contracts, channel-frontend-contract, legacy migrations, capability maps), `scripts/` (10 Python + 2 Bash), `evals/` (rubric, failure cases, semantic config, 181-line trigger cases, expected artifacts, 1 245-line unittest file), `security/` (`network_policy.json`, `permission_policy.json`), `templates/` (brief template, homepage design JSON), `examples/` (sanitised static preview of a Chinese editorial theme `qiaomu-editorial-20260418`, channel report JSON), `reports/` (conformance matrix, output quality scorecard, security trust report with package SHA-256, remote CLI / updater reviews, `skill-ir.json`). Sibling generic skills (`laravel-best-practices`, `testing-best-practices`, `configuring-horizon`, `tailwindcss-development`, `ai-sdk-development`) are Laravel Boost exports duplicated into `.claude/skills`, `.cursor/skills`, `.agents/skills`; `.codex/config.toml`, `.gemini/settings.json`, `.mcp.json` point tools at the Boost MCP server.

**Modes / routing.** Five modes selected once per phase: `development` (source edits + tests), `operations` (runtime CLI/API/admin only, no code), `public_frontend` (themes/homepage payloads), `channel_frontend` (agent-site packages/capability sync), `legacy_migration`. Routing rule: discover first (`geoflow whoami/capabilities/doctor` or `discover_geoflow_workspace.py`), load exactly one route's references. Trigger evaluation uses `evals/semantic_config.json` (positive phrases incl. Chinese "渠道目标包", negatives excluding GIS, generic Laravel, "GEO content strategy", summary-only) and `evals/trigger_cases.json` (threshold 0.34; should/should-not trigger sentences, mostly Chinese).

**Scripts (what each does).**
- `geoflow_preflight.sh <workspace> [config] [checks]` — read-only availability check of API v1 / admin path before mutations; HTTPS required for non-loopback bearer calls, 20 s timeout, 5 MB cap, token in mode-0600 temp header file, redacts secrets in errors. Header: "Copyright (c) 2026 姚金刚. All rights reserved."
- `discover_geoflow_workspace.py <workspace> [--output] [--compact]` — static discovery of routes/commands/services without booting Laravel.
- `discover_frontend_surfaces.py`, `discover_themes.py` — enumerate Blade views, themes, manifests.
- `prepare_theme_edit_session.py` / `finalize_theme_edit_session.py` — preview-fork a theme (`--base-theme`, `--new-theme-id`), then publish-as-new or confirmed replace (`--mode`, `--confirm-live-risk`, `--backup-root`), with symlink/path validation and cross-process locks.
- `validate_homepage_design_payload.py <payload>` — schema validation of `homepage-design.json`.
- `build_sync_preview_report.py` / `compare_default_vs_channel_frontend.py` (`--workspace --channel --report [--live-remote]`) — call `php artisan geoflow:frontend-experience` (argument-list subprocess, no shell) to compare default vs channel capabilities; `channel_endpoint_safety.py` validates endpoints (HTTPS or loopback, no userinfo/query/fragment) before live calls.
- `serve_preview.py [--port]` — 127.0.0.1-only static server for the bundled example, fixed file allow-list.
- `install_codex_skill.sh` — stages only the files in `expected_artifacts.json` (rejects symlinks/`..`), syntax-checks scripts, moves existing `geoflow` and retired `yao-geoflow-*` dirs to `~/.codex/skill-backups/geoflow-<ts>.<rand>/`, atomically renames the stage into `~/.codex/skills/geoflow`; rollback = move the backup back (documented in README). Codex-specific paths; no Claude Code / generic installer.

**Evals approach.** `rubric.md` (6 dimensions scored 1–5: routing, discovery, contract safety, execution, verification, handoff; promotion at avg >= 4.0, zero forbidden behaviours, all artifacts present); `failure_cases.md` (15 anti-patterns, e.g. resending after missing receipt, v1 write fallback, printing secrets); `expected_artifacts.json` (`mode_outputs`, `required_report_fields`, `quality_expectations`, `forbidden_behaviors`); `test_geoflow_scripts.py` = 39 deterministic unit tests of script safety run in CI; `reports/output_quality_scorecard.md` and `conformance_matrix.md` are hand-written. There is **no LLM-graded eval harness, no golden transcripts, no automated trigger-precision measurement** in CI (trigger cases are data only).

**Security policy JSONs.** `network_policy.json` (schema 1.0): default HTTPS-required, hosts "operator-selected and task-scoped"; per-script allowed hosts/paths/timeouts/size caps/auth; loopback listener spec. `permission_policy.json`: three capabilities (`network`, `file_write`, `subprocess`) each with decision `approved`, reviewer "GEOFlow maintainer, user-authorized merge review", scope, reason, `expires_at: 2027-07-19`, evidence files, per-platform enforcement notes (all say "SKILL.md guardrails" — i.e. prose, not runtime enforcement).

**Portability limits.** Helpers require macOS/Linux/WSL, Python 3.10+, Bash, curl; live channel reports require PHP + project `artisan`; installer targets Codex only; `agents/openai.yaml` is OpenAI-flavoured; the CLI is PHP 8.3+ (PHAR) — not usable from a pure Node/TS environment; references are tightly bound to GEOFlow routes, theme contracts and Chinese product concepts (BaoTa, Zhihu, WeChat); 23/63 files contain Chinese; 16 skill files carry "All rights reserved" headers.

**Quality assessment.** Strong: explicit mode boundaries, discovery-first guardrails, receipts/idempotency discipline, script hardening tested in CI, declared network/permission policy, install/rollback safety. Weak: SKILL.md is terse and delegates almost everything to 22 references (high context cost); no measurable eval of agent behaviour; platform enforcement is advisory; no versioned changelog for the skill; heavy coupling to one product's internals; preview status ("publication, rollback, full administration remain pending").

## 16. KEEP / IMPROVE / REPLACE / REMOVE / ADD (for an EU-native, English-only, governance-first, model-agnostic TypeScript GEO platform + Agent Skill)

**KEEP (concepts to re-implement clean-room)**
- Two-stage publication gate (deterministic risk scan -> LLM quality gate) with immutable check records, input fingerprints and stale-invalidation on any dependency change — the single most valuable design.
- Versioned rule set + algorithm version string + percentage rollout buckets with shadow scoring.
- Three-tier evidence model (broad text -> chunks with serving generations -> published atomic facts) and per-KB readiness blockers.
- Embedding-profile fingerprinting per chunk/KB with mixed-profile rejection and atomic generation swap.
- Prompt-injection quarantine of retrieved evidence before it reaches the reviewer prompt.
- SSRF-hardened outbound client contract (normalise -> resolve -> pin -> cap -> re-validate redirects).
- Scoped API tokens, request-id echo, idempotency keys with payload fingerprints, operation receipts.
- Human approval points with recorded reason, actor and minimum-score floor; AI-workspace plan/target digests + approval expiry.
- Distribution publisher interface (health/publish/update/delete/syncSettings) with idempotent remote-id reuse and unknown-outcome reconciliation.
- Device-code pairing model for a browser operator with least-privilege scopes.

**IMPROVE**
- Scorer: keep 4-dimension weighted deductions but make dimensions/weights a versioned policy document, add EU-specific dimensions (claims substantiation per UCPD, health/finance claim classes, AI-disclosure presence).
- Fact-candidate extraction: replace Chinese regex lexicon with an English/EU claim taxonomy (percent, currency EUR/GBP/CHF, ISO dates, superlatives, certifications CE/ISO/GDPR, guarantees) and allow an LLM extractor fallback.
- Retrieval: keep hybrid scoring but add BM25/full-text (Postgres `tsvector`) and an optional reranker; expose retrieval trace per claim.
- SEO head: add `og:image`, Twitter cards, `hreflang`, `article:published_time`, per-crawler robots rules, `FAQPage`/`Organization` schema; serve `/llms.txt` on the primary site.
- Crawler analytics: extend UA classifier to a maintained registry with per-bot policy and log-based attribution.
- Observability: replace ad-hoc `Log::info` with OpenTelemetry traces/metrics, structured JSON logs, request IDs on all surfaces.
- Secrets: AEAD (XChaCha20-Poly1305 / AES-GCM) with key versioning and external KMS option.
- Activity log: log all mutations across API/CLI/UI uniformly, add tamper-evident hash chain, exportable.
- Skill evals: turn `trigger_cases.json` and rubric into an executed harness with LLM grading + golden transcripts.

**REPLACE**
- Laravel/PHP monolith -> TypeScript (e.g. Fastify/Nest + Drizzle/Prisma on Postgres+pgvector, BullMQ on Redis), keeping the domain boundaries above.
- `laravel/ai` -> Vercel AI SDK or a thin provider-agnostic adapter with per-provider metadata (region, DPA, training-usage, retention) as first-class model registry fields.
- AI-visibility probes (Doubao/DeepSeek/feedcoop) -> EU-relevant engines (ChatGPT/OpenAI, Perplexity, Google AI Overviews/Gemini, Claude, Copilot, Mistral) with share-of-voice and citation-URL matching.
- Chinese-first prompts/tests/docs -> English source of truth; i18n only for UI strings.
- Codex-only skill installer -> platform-neutral installer (Claude Code, Codex, Cursor, generic) with a JSON manifest and signed archive.
- Blade theme system + generated PHP "agent sites" -> static/SSR export (Astro/Next) or headless API; drop PHP artefacts.

**REMOVE**
- WeChat exporter, Zhihu adapter, BaoTa panel fallbacks, Doubao/feedcoop clients, Toutiao/NetEase demo themes and Chinese example theme.
- Default outbound GitHub update check (make opt-in with an EU-hosted mirror).
- Unauthenticated "All rights reserved" headers / mixed licence notices.
- `php artisan serve` dev-server compose path for anything production-like.
- Hosted multi-subdomain content farms with publish quotas (`min_articles_before_index`, daily limits) — a spam-scaling feature at odds with a governance-first positioning; keep single primary site + external channels.

**ADD**
- Provider registry with data-residency, DPA/SCC reference, training-opt-out, retention and model-card fields; policy engine that blocks non-compliant models per tenant.
- Tenant/site-scoped RBAC with roles (owner, editor, reviewer, auditor), MFA (TOTP/WebAuthn), OIDC/SAML SSO.
- EU AI Act Art. 50 transparency: mandatory public AI-generated labelling, machine-readable provenance (C2PA/`schema.org` `isBasedOn`/`creditText`), disclosure templates.
- GDPR tooling: consent capture on lead forms, retention policies per table, DSAR export/erasure, RoPA/DPIA templates generated from configuration, EU-only processing mode.
- Approval workflow engine with multi-reviewer, SLA, escalation and signed decision records.
- Cost governance: price catalogue, per-tenant budgets, alerts, monthly statements.
- Evidence provenance: source URL/date/licence per fact, citation rendering in output, claim-to-evidence trace UI.
- `/llms.txt`, `llms-full.txt`, per-crawler robots policy, IndexNow/sitemap ping, structured-data validator.
- Skill: English-only, TypeScript CLI (`npx`), typed JSON contracts, executed eval harness, SBOM + signature.

## 17. Feature matrix

| Feature | Upstream status | Upstream location | Notes |
|---|---|---|---|
| Task-driven article generation (title lib -> prompt -> model) | present | `Services/GeoFlow/WorkerExecutionService`, `Jobs/ProcessGeoFlowTaskJob`, `Models/Task` | Loop/scheduled tasks, draft/article limits |
| Streaming generation to editor | present | `ArticleContentGenerationService::stream`, `ArticleContentStreamSession`, Reverb | |
| Title generation batches | present | `TitleGenerationCoordinator`, `ProcessTitleGenerationBatchJob` | Rate-limited, recoverable |
| Prompt library (DB, versioned system prompts) | present | `Models/Prompt`, `ArticleContentPromptRenderer` | |
| Knowledge base upload (txt/md/docx) | present | `KnowledgeSourceParser` | No PDF/HTML/CSV |
| URL import to draft | present | `UrlImportProcessingService`, `Jobs/ProcessUrlImportJob` | LLM analysis model |
| Chunking (rule + LLM semantic) | present | `KnowledgeChunkSyncService::planChunks|buildSemanticChunks` | |
| Embeddings + pgvector | present | `KnowledgeChunkSyncService`, migration `..._knowledge_chunks_embedding_vector` | `vector(3072)`, profile fingerprints |
| Hybrid retrieval (vector + keyword) | present | `KnowledgeRetrievalService::retrieveEvidence` | No BM25/reranker |
| Atomic fact library + revisions | present | `Services/GeoFlow/KnowledgeFacts/*`, `Models/KnowledgeFact*` | LLM generated, human review/publish |
| Fact-candidate extraction from articles | present (Chinese lexicon) | `ArticleFactCandidateExtractor` | |
| Deterministic risk scan (sensitive words) | present | `ArticleRiskScanner`, `ArticleRiskGate`, `Models/SensitiveWord` | |
| LLM quality gate with scoring | present | `ArticleAiQualityGate`, `ArticleAiQualityScorerV2`, `ArticleAiQualityInspectionService` | 85/70 thresholds |
| Rule/algorithm versioning + staged rollout | present | `ArticleAiQualityPrincipleCompiler`, `ArticleAiQualityVersionPolicy`, `ArticleAiQualityRolloutPolicy` | |
| Check invalidation on dependency change | present | `ArticleAiQualityInvalidationService` | |
| Timeout sampling fallback | present | `ArticleAiQualitySampleBuilder`, `tryStartSampledFallback` | Strict auto-release guard |
| Manual override with reason + floor | present | `ArticleAiQualityGate::checkLocked` | |
| Auto-optimisation loop (patch/re-score) | present | `ArticleAiOptimizationCoordinator`, `LaravelArticleAiOptimizationRefiner` | |
| Prompt-injection detection on evidence | present | `KnowledgeEvidenceSecurityInspector` | Regex EN/ZH |
| Provider circuit breaker | partial | `ArticleAiQualityProviderCircuitBreaker` | Quality path only |
| Daily quota per model/provider | present | `AiUsageQuotaService`, `AiModel.daily_limit` | |
| Token/cost ledger | present | `ai_model_usage_events`, `AiModelUsageRecorder` | Estimated cost, no price table |
| Model failover | present | `AiModelFailoverDecider`, `failover_priority` | |
| Provider abstraction | partial | `OpenAiRuntimeProvider` (openai, openai-compatible, deepseek, gemini, openrouter) | No Anthropic/Azure/Mistral drivers |
| Provider data-policy / residency metadata | absent | — | Explicitly verified absent |
| Per-admin model ownership & sharing | present | `Services/Admin/AdminAiSharingService`, `AiModel.owner_admin_id/access_scope` | |
| AI Workspace (chat agent with approvals) | present | `app/Ai/Workspace`, `Services/AiWorkspace`, `AiWorkspaceStateMachine` | Off by default |
| WordPress REST distribution | present | `WordPressRestPublisher` | Idempotent |
| Generic HTTP distribution | present | `GenericHttpApiPublisher` + resolver/factory/mapper | |
| Generated PHP agent sites | present | `DistributionTargetSitePackageBuilder`, `GeoFlowAgentPublisher` | HMAC-signed calls |
| Hosted multi-subdomain sites | present (off by default) | `Services/HostedSites/*`, `HostedSiteResolver` | Publish quotas |
| Manual publication work orders | present | `ManualPublicationService`, `Models/ManualPublication*` | |
| Chrome operator extension | present (0.1.0) | `browser-extension/` | Zhihu only |
| Device-code pairing | present | `DeviceAuthorizationService`, `BrowserDeviceAuthorizationController` | |
| Themes (Blade) + packages + remote drafts | present | `resources/views/theme/*`, `SiteThemePackageService`, `ThemeWorkspaceService` | Publication/rollback pending |
| Theme replication from reference URL | present | `Services/Admin/SiteThemeReplication/*` | Deterministic, not LLM |
| SEO meta + OG + canonical | partial | `site/partials/seo-head.blade.php` | No og:image/Twitter/hreflang |
| JSON-LD | partial | `components/json-ld.blade.php`, `site/article|home|about.blade.php` | Article/WebSite/AboutPage |
| Sitemap (index + shards) | present | `SiteDiscoveryController`, `SitemapManifest`, `BuildSitemapManifest` | |
| robots.txt | partial | `SiteDiscoveryController::robots` | No per-bot rules |
| llms.txt | partial | agent-site package only | Absent on primary site |
| Permalink presets + slug history redirects | present | `Support/Site/ArticlePermalink*`, `ArticleSlugHistory` | |
| URL-change risk workflow | present | `Services/Site/UrlChange*`, `UrlChangeRequest` | Typed confirmation, super admin |
| Lead forms + submissions | present | `LeadForm`, `LeadSubmission`, `SiteLeadFormController` | No consent field |
| View logs + crawler classification | present | `RecordSiteViewLog`, `TrafficClassifier` | ai_bot bucket |
| Admin analytics dashboards | present | `Services/Admin/Analytics/*` | |
| AI visibility probing | present (CN providers) | `Services/GeoFlow/AiVisibility/*` | Doubao Ark, DeepSeek, feedcoop |
| Competitor detection | present | `AiVisibilityCompetitorDetectionService`, `DetectAiVisibilityCompetitorsJob` | |
| REST API v1 with scopes | present | `routes/api.php`, `EnsureApiScope`, `ApiTokenService` | |
| Idempotency keys | present | `IdempotencyService`, `ApiIdempotencyKey` | v2 fingerprints |
| Request IDs | partial | `AssignApiRequestId` | API only |
| CLI (repo + standalone PHAR) | present | `app/Console/GeoFlowCli`, `packages/geoflow-cli` | Signed via GitHub attestations |
| Updater (blue/green, backup, rollback) | present (external agent) | `Services/SystemUpdater/*`, `resources/update-trust/root.json` | TUF-style trust |
| Admin activity log | present | `LogAdminActivity`, `AdminActivityLog` | Mutations only |
| Security audit command | partial | `SecurityAuditService` | Integrity checks only |
| SSRF protection | present | `Services/Outbound/*` | Strong |
| Login lockout / rate limits | present | `AdminLoginLockService`, `RateLimiter::for(...)` | |
| MFA / SSO | absent | — | |
| Tenant/site RBAC | absent | — | Two roles |
| Retention policies (global) | partial | AI workspace 90 d, fact runs 90 d | Logs/leads/visibility unbounded |
| GDPR DSAR / consent / DPIA | absent | — | |
| AI-generated public labelling | absent | `Article.is_ai_generated` unused in views | |
| Telemetry (opt-in) | present, off | `AnonymousUsageTelemetry` | Update check on by default |
| OpenTelemetry / metrics export | absent | — | Horizon only |
| Multi-language admin UI | present | `lang/{en,es,ja,pt_BR,ru,zh_CN,zh_TW}` | zh_CN source |
| Agent Skill | present (preview 1.2.0) | `.agents/skills/geoflow` | Codex installer, CN references |
| Skill security policy files | present | `security/network_policy.json`, `permission_policy.json` | Advisory enforcement |
| Executed skill evals | partial | `evals/test_geoflow_scripts.py` | Script safety only |
| E2E browser tests | absent | `tests/Browser` empty | |
| Static analysis | absent | — | Pint only |

## 18. Licensing implications

**Facts.**
- Current licence: **AGPL-3.0-only** for every revision from the v3.0.0 change (2026-09-05) onward (`LICENSE`, `NOTICE`, `package.json`). AGPL section 13 extends copyleft to network use: anyone who modifies GEOFlow and lets users interact with it over a network must offer the complete corresponding source of the modified version to those users.
- Historical portions: v2.x releases were Apache-2.0; NOTICE states those portions "remain subject to Apache-2.0" and retains `docs/licenses/Apache-2.0.txt`. The repository does not mark which files are Apache-origin (no per-file headers), so the Apache-2.0 carve-out cannot be applied file-by-file from the current tree; only a pre-change tag (v2.3.0 or earlier) is unambiguously Apache-2.0.
- Third-party MIT: DeepSeek Harness (c) 2026 DeepSeek and DeepSeek Harness Desktop 2.0.2 (c) 2026 Anywhere Labs — "adaptations inspired by" in AI-workspace run-status/timeline/readiness patterns; MIT texts in `docs/licenses/`. MIT requires notice preservation if code is copied.
- Contradictory notices: 44 files (25 theme Blade views, 16 skill files incl. `scripts/geoflow_preflight.sh`, `references/operation-boundary.md`, 1 admin view, `FrontendDemoSeeder.php`, 1 controller) carry "Copyright (c) 2026 姚金刚. All rights reserved." headers. These sit inside an AGPL-licensed tree; the outbound licence is still AGPL by virtue of `LICENSE`/`NOTICE`, but the headers signal reserved rights and would need to be removed or reconciled in any redistribution.
- CLA (`CLA.md`): contributors grant Yao Jingang a perpetual, sublicensable licence permitting proprietary/commercial relicensing (Harmony option five) and waive moral rights. Contributing upstream therefore feeds a dual-licensing business; it does not affect downstream use of the AGPL copy.
- Trademark/branding: "GEOFlow" name, X handle and GitHub links are embedded in admin footers and docs; AGPL does not grant trademark rights.

**Option A — clean-room TypeScript reimplementation (recommended).**
- Copyright protects expression, not ideas, algorithms or interfaces. Re-implementing the *concepts* documented in this report (gate pipeline, fingerprints, rollout buckets, three-tier evidence, SSRF policy shape, scoring dimensions) in TypeScript from a specification, without copying PHP code, prompts, regex tables, schema literals, docs or theme assets, yields an independent work not subject to AGPL.
- Practical hygiene: (1) keep this report and derived specs as the only inputs to implementers; (2) do not port files, comments, prompt strings, JSON-LD builders, regex lexicons or migration column lists verbatim; (3) avoid reproducing distinctive non-functional choices (e.g. header names `X-GEOFlow-*`, `enc:v1`, error code strings) to reduce substantial-similarity arguments; (4) record provenance (who read what) — a two-team "dirty/clean" split is the conventional safeguard; (5) do not vendor `resources/update-trust/root.json`, skill scripts or example themes.
- No NOTICE/attribution obligation arises for a genuine clean-room work, though citing GEOFlow as prior art is harmless.

**Option B — adapting or porting upstream code.**
- Any port of copyrightable expression (line-by-line translation of a PHP class to TypeScript, copied prompts, regex tables, docs) is a derivative work: the resulting product must be AGPL-3.0-only (or a compatible later-version-excluded combination), must ship full source to network users (section 13), must preserve copyright notices and the NOTICE text (section 7 additional terms as applied via NOTICE), and cannot be combined with proprietary modules in the same program without releasing them.
- Commercial/SaaS use without source disclosure would require a separate commercial licence from the copyright holder (NOTICE offers this).
- Apache-2.0 salvage is only clean for content taken from a pre-AGPL tag (<= v2.3.0), with Apache NOTICE/attribution retained; anything added after 2026-09-05 is AGPL.
- MIT-derived DeepSeek Harness patterns: if the *upstream adaptation* is copied, the MIT notices must travel with it; if the *original* DeepSeek Harness project is used directly, only its MIT terms apply.
- The Agent Skill files are inside the AGPL tree but 16 of them carry "All rights reserved" headers; reuse of skill prose/scripts is doubly problematic and should be avoided.

**Implication for the target product.** Build the TypeScript platform and skill clean-room (Option A). Treat GEOFlow strictly as a reference for feature scope and threat model; do not import any file, prompt, dictionary, schema or documentation text. Choose the target licence independently (e.g. Apache-2.0 or BSL for the platform, MIT/Apache-2.0 for the skill).

---
*Report generated 2026-09-18 from a local clone at commit 9ed2fe80457d5eb280a4bca7cf799895bf2ca3b1. Counts were measured with `find`/`grep`/Python over the working tree; no upstream code was executed.*

## Appendix A. Evidence index (files inspected per section)

Use this list to bound what the "dirty room" reviewer has seen; clean-room implementers should work only from the report text above.

| Section | Upstream files read (relative to repo root) |
|---|---|
| 1 Identity | `version.json`, `NOTICE`, `LICENSE`, `CLA.md`, `AGENTS.md`, `docs/agent-config/AGENTS.md`, `composer.json`, `package.json`, `docs/CHANGELOG_en.md` (2026-09-16 .. 2026-09-05), `docs/licenses/*`, `lang/`, git tags/log |
| 2 Architecture | `docker-compose.yml`, `docker-compose.prod.yml`, `docker/Dockerfile.prod`, `config/horizon.php`, `config/geoflow.php`, `config/ai-workspace.php`, `routes/console.php`, `routes/web.php` (route groups), `routes/api.php` (full), `bootstrap/app.php` (middleware aliases), `app/Services/SystemUpdater/{RemoteUpdaterService,UnixSocketAgentClient,CoordinatedAgentProtocol,TufBootstrapVerifier}.php`, `resources/update-trust/root.json`, `packages/geoflow-cli/{README,DISTRIBUTION}.md`, `docs/GEOFLOW_CLI_en.md`, `app/Support/Site/SiteThemeCatalog.php`, `app/Services/Admin/SiteThemeReplication/{ThemeReplicationAgent,ThemeReferenceFetcher}.php`, `app/Services/Site/HostedSiteResolver.php`, `app/Services/HostedSites/HostedSiteAllocator.php`, `app/Ai/Workspace/*` (listing), `app/Services/AiWorkspace/{AiWorkspaceStateMachine,AiWorkflowEngine,AiWorkspaceGovernanceMetrics}.php` |
| 3 Data model | `app/Models/*` (listing), `app/Models/{AiModel,Article,Task,KnowledgeBase,KnowledgeChunk,ArticleAiQualityCheck,DistributionChannel,ManualPublication,HostedSiteProfile,AiVisibilityRun,AiWorkspaceRun,AiWorkspaceApproval,AdminActivityLog,SystemLog,Admin,Prompt}.php` (fillable/casts/constants), `database/migrations/*` names and `create_*` files for `ai_source_providers`, `ai_model_usage_events`, `add_access_ownership_to_ai_models`, pgvector migrations |
| 4 Knowledge & RAG | `app/Services/GeoFlow/{KnowledgeSourceParser,KnowledgeChunkSyncService,KnowledgeRetrievalService,KnowledgeEmbeddingModelFingerprint,AiQualityRetrievalReadinessService,ArticleAiQualityEvidenceBuilder,AtomicFirstEvidenceStrategy,ChunkEvidenceStrategy,KnowledgeBroadEvidenceStrategy,ArticleAiQualityEvidenceStrategyResolver,KnowledgeEvidenceSecurityInspector,ArticleFactCandidateExtractor,UrlImportProcessingService}.php`, `app/Services/GeoFlow/KnowledgeFacts/*` (listing), `app/Support/GeoFlow/AiQualityRetrievalMode.php`, `app/Jobs/EmbedKnowledgeChunkBatchJob.php` |
| 5 Content generation | `app/Ai/Agents/*` (listing), `app/Ai/Agents/{MarkdownContentWriterAgent,TitleGeneratorAgent,ArticleQualityReviewerAgent}.php`, `app/Services/GeoFlow/{ArticleContentGenerationService,ArticleContentStreamSession,ArticleContentPromptRenderer,ArticleAiQualityPromptRenderer,ArticleAiQualityPrincipleCompiler,LaravelArticleAiOptimizationRefiner}.php` |
| 6 Gates & workflow | `app/Support/GeoFlow/ArticleWorkflow.php`, `app/Services/GeoFlow/{ArticlePublicationQualityGate,ArticleRiskGate,ArticleRiskScanner,ArticleAiQualityGate,ArticleAiQualityScorerV2,ArticleAiQualityVersionPolicy,ArticleAiQualityPolicyResolver,ArticleAiQualityInspectionService,ArticleAiQualityInvalidationService,ArticleWorkflowTransitionService}.php` |
| 7 Distribution | `app/Services/GeoFlow/{DistributionPublisherInterface,DistributionOrchestrator,WordPressRestPublisher,GenericHttpApiPublisher,GeoFlowAgentPublisher,HostedSitePublisher,DistributionSigningService,DistributionTargetSitePackageBuilder,ManualPublicationService}.php`, `app/Services/BrowserOperations/DeviceAuthorizationService.php`, `browser-extension/{manifest.json,PRIVACY.md,README.md}`, `browser-extension/src/lib/{api-client,url-policy}.js`, `browser-extension/src/adapters/` (listing) |
| 8 SEO/GEO | `resources/views/site/partials/seo-head.blade.php`, `resources/views/site/{article,home,about}.blade.php` (JSON-LD blocks), `resources/views/components/json-ld.blade.php`, `app/Http/Controllers/Site/SiteDiscoveryController.php`, `app/Services/Site/SitemapManifest.php`, `app/Support/Site/ArticlePermalinkPattern.php`, `DistributionTargetSitePackageBuilder::initialLlmsText` and JSON-LD `@type` values |
| 9 Analytics & visibility | `app/Support/Analytics/TrafficClassifier.php`, `app/Services/Admin/Analytics/*` (listing + method signatures), `app/Services/GeoFlow/AiVisibility/{AiVisibilityService,DeepSeekAnalysisClient,DoubaoArkResponsesClient,DoubaoSearchCustomClient,AiProviderEndpointPolicy}.php`, `app/Models/AiSourceProvider.php`, `config/geoflow.php` `ai_visibility` block |
| 10 Model abstraction | `app/Support/GeoFlow/{OpenAiRuntimeProvider,AiModelFailoverDecider,ApiKeyCrypto}.php`, `app/Services/GeoFlow/{AiUsageQuotaService,ArticleAiQualityProviderCircuitBreaker}.php`, `app/Services/Admin/{AiModelUsageRecorder,AiModelUsageLedgerSchema,AiModelReferenceCatalog}.php`, `app/Models/AiModel.php`, `laravel/ai` import census across `app/` |
| 11 Security | `app/Services/Outbound/{SafeOutboundHttpClient,FinalOutboundSecurityPolicy,SystemHostResolver,SecureHttpFactory}.php`, `app/Services/Security/SecurityAuditService.php`, `app/Http/Middleware/{AuthenticateApiToken,EnsureApiScope,EnsureSuperAdmin,AssignApiRequestId,GuardRecoveryTraffic,LimitArticleMarkdownExportRequestSize,LogAdminActivity}.php`, `app/Services/Api/{ApiTokenService,ManagementScopePolicy,ThemeManagementPolicy,IdempotencyService}.php`, `app/Support/GeoFlow/AdminLoginLockService.php`, `app/Services/GeoFlow/AnonymousUsageTelemetry.php`, `.env.example`, `app/Providers/*` (rate limiter names), CSP/2FA/SSO greps |
| 12 Governance | `app/Models/AdminActivityLog.php`, `app/Http/Middleware/LogAdminActivity.php`, `app/Console/Commands/{PruneAiWorkspaceDataCommand,PruneDeletedTasksCommand}.php`, `config/*.php` retention keys, `app/Support/Lead/LeadFormFields.php`, GDPR/DPIA/AI-Act greps over `app/`, `config/`, `docs/` |
| 13 Observability | `config/logging.php`, `AssignApiRequestId`, `app/Services/GeoFlow/HorizonMetricsAdapter.php`, `AiWorkspaceGovernanceMetrics`, `routes/console.php` |
| 14 Tests & CI | `tests/*` (counts), `phpunit.xml`, `phpunit.postgresql.xml`, `.github/workflows/{ci,cli-candidate,cli-check,cli-release,cli-sign,cli-trust}.yml`, `packages/geoflow-cli/tests/` |
| 15 Skill | `.agents/skills/geoflow/{SKILL.md,README.md,manifest.json}`, `agents/{openai,interface}.yaml`, `security/{network_policy,permission_policy}.json`, `evals/{rubric.md,failure_cases.md,semantic_config.json,trigger_cases.json,expected_artifacts.json,test_geoflow_scripts.py}`, `scripts/*` (docstrings/args/headers), `references/{remote-cli-workflow,operation-boundary}.md`, `reports/security_trust_report.md`, `.claude/`, `.codex/`, `.cursor/`, `.gemini/` listings |
| 18 Licensing | `LICENSE`, `NOTICE`, `CLA.md`, `docs/licenses/*`, "All rights reserved" header census (44 files) |

## Appendix B. Numbers at a glance

| Metric | Value |
|---|---|
| PHP files in `app/` | 889 |
| Eloquent models | 95 |
| Migrations | 166 |
| Services in `app/Services/GeoFlow/` | ~140 classes (+ `AiVisibility/` 17, `KnowledgeFacts/` 15) |
| Jobs / console commands | 30 / 42 |
| Middleware | 22 |
| API v1 routes | ~75 (`routes/api.php`, 209 lines) |
| Admin/site web routes file | 790 lines |
| Built-in themes | 27 |
| Locales | 7 (zh_CN source) |
| Test methods | Unit 709, Feature 2 669, PostgreSQL 27, Perf 1, JS 208, skill 39, CLI 24 |
| Files with CJK text | app 237/889, tests 161/348, docs 94/102, skill 23/63 |
| "All rights reserved" headers | 44 files |
| Default outbound calls | GitHub release metadata (update check on by default); telemetry off |
| AI providers (chat/embeddings) | openai, openai-compatible, deepseek, gemini, openrouter |
| AI providers (visibility) | Doubao Ark (volces.com), DeepSeek, feedcoop web search |
| Quality thresholds | pass 85, manual-override floor 70, <=2 model candidates, 180 s deadline |
| Retrieval weights | vector 0.45 / lexical 0.35 / title 0.12 / metadata 0.08 |
| Vector column | pgvector `vector(3072)` |
