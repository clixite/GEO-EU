# GEO / AEO State of the Art — Evidence-Tiered Methodology Brief

Prepared: 2026-09-18. Status: complete first pass (all URLs accessed 2026-09-18).
Purpose: input for (a) an analysis engine and (b) a public methodology page. Nothing tiered below B may be encoded as fact; C items may be surfaced as "observational", D/E only as "hypothesis" / "not supported".

Evidence tiers used throughout:
- A = experimentally supported by peer-reviewed or large-N controlled/quasi-controlled study
- B = official engine recommendation or documentation (Google, OpenAI, Anthropic, Microsoft, Perplexity)
- C = emerging, with observational support (vendor studies, correlational, N disclosed)
- D = hypothesis (plausible mechanism, no direct evidence)
- E = folklore / unsupported / contradicted

Baseline inputs read (NOT treated as authority): ~/.claude/skills/ai-seo/SKILL.md (v2.4.0) plus references/ (platform-ranking-factors, agent-readiness, content-patterns, content-types, okf, youtube-ai-citations, citations-vs-recommendations) and ~/.claude/skills/ccg/domains/seo/seo-growth.md. Claims from those files are re-verified below and re-tiered; several are downgraded (see Section 4).

Verification note: where a fetch was blocked (HTTP 403) the entry says so and the wording is marked "via secondary reporting". Vendor-study numbers were re-read from the vendor's own page unless marked otherwise.

---

## 1. Executive summary

1. The only technique with peer-reviewed experimental support (Aggarwal et al., KDD 2024) is adding citations, statistics and quotations to a page that is *already in the engine's retrieved context*; the "up to 40%" figure is an in-context upper bound, not a retrieval or traffic effect, and a NeurIPS 2025 benchmark (C-SEO Bench) found most such rewrites "largely ineffective" and sometimes negative.
2. The July 2026 critical survey of 45 GEO studies concludes that "topical relevance and context position are the most reproducible levers", that "generic heuristics transfer poorly", and that "no reviewed technique shows a stable, longitudinal, cross-platform causal effect on organic discoverability".
3. Google's official guide (updated 2026-07-10) says AI Overviews / AI Mode need no special markup, files, chunking, length or writing style; llms.txt is ignored; structured data is not required; AEO/GEO "is still SEO". Bing's rewritten guidelines (Feb 2026) say the same and add that "GEO doesn't guarantee citations".
4. Crawl access is the one deterministic, engine-documented prerequisite: OAI-SearchBot, Claude-SearchBot/Claude-User, PerplexityBot, Googlebot (not Google-Extended), bingbot, plus snippet / NOARCHIVE / NOCACHE controls. Opting OAI-SearchBot out means the site "will not be shown in ChatGPT search answers".
5. Structured data does not measurably lift AI citations: Ahrefs' controlled study (1,885 treated vs 4,000 control pages, May 2026) found +2.4% / +2.2% (not significant) on AI Mode / ChatGPT and a small significant *decline* on AI Overviews. Organization/Article JSON-LD stay Tier B for entity and date understanding in Google Search, not for citation lift.
6. FAQ rich results were removed from Google Search on 2026-05-07; FAQPage schema as an AI-citation lever is folklore. llms.txt has ~10% adoption, no correlation with citations (SE Ranking, ~300k domains), and Google's John Mueller said in June 2026 that "none of the AI systems use it".
7. Freshness is the strongest large-N observational signal: AI-cited URLs are ~25.7% newer than organic results (Ahrefs, 17M URLs); 72% of cited pages were *updated* in the past year vs 42% *published* in it (Seer, 4,124 pages). Maintenance beats publishing.
8. Off-site brand presence (branded web mentions rho=0.664, YouTube mentions rho~0.737, Ahrefs 75k brands) out-correlates backlinks (0.218) for AI visibility; ~62% of citations never name the brand ("ghost citations", Semrush). Correlational, and not computable from a page's HTML.
9. Measurement must treat every answer as a sample: within-prompt resampling explains ~35% of response variance and query language ~27% (arXiv 2607.13304); weekly citation replacement is 56-74%; the recommended protocol is 7-8 repeats x 3-5 paraphrases x engine x date with Wilson intervals. Consumer UIs of OpenAI, Anthropic, Perplexity, Google and Microsoft all prohibit automated access; official APIs (with citation-display duties) are the compliant path.
10. Recommended readiness score: weight only Tier A/B items; surface Tier C as "observations" with reduced weight; give Tier D/E zero weight; publish the weights as an explicit, versioned product decision.

---

## 2. How answer engines retrieve and cite today (accessed 2026-09-18)

### 2.1 Google AI Overviews and AI Mode
- Retrieval: "rooted in our core Search ranking and quality systems"; retrieval-augmented generation plus "query fan-out" ("issuing multiple related searches across subtopics and data sources") to show "a wider and more diverse set of helpful links". Eligibility = indexed + snippet-eligible. Sources: https://developers.google.com/search/docs/appearance/ai-features (last updated 2025-12-10); https://developers.google.com/search/docs/fundamentals/ai-optimization-guide (last updated 2026-07-10).
- Crawler: Googlebot only. "Google-Extended" is a robots.txt token, not a user agent; it governs training of Gemini models and "grounding in Gemini Apps and Vertex AI" and "does not impact a site's inclusion in Google Search nor is it used as a ranking signal". Source: https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers (2026-07-14).
- User-triggered fetchers (Google-Agent, Google-GeminiNotebook, Google-Read-Aloud, etc.) "generally ignore robots.txt rules". Source: https://developers.google.com/search/docs/crawling-indexing/google-user-triggered-fetchers (2026-08-19).
- Controls: robots.txt (Googlebot), noindex, nosnippet, data-nosnippet, max-snippet; plus the Search Console "Search generative AI control" (worldwide since 2026-08-31), which removes a site from AI Overviews, AI Mode and Discover gen-AI features, "isn't used as a ranking or inclusion signal affecting other parts of Search", and does not affect the Gemini app. Source: https://support.google.com/webmasters/answer/16908024.
- Citation UI: inline link chips and link cards; AI Mode is a separate conversational tab; at I/O (2026-05-19) Google announced the surfaces are converging (secondary reporting).
- Reporting: AI Overviews / AI Mode impressions are counted inside the "Web" search type; a dedicated Generative AI performance report (impressions only; page / country / device / date; property-level de-duplication) reached all sites on 2026-08-31. Sources: https://support.google.com/webmasters/answer/16984139 ; https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports.
- Coverage: AI Overviews in 200+ countries and territories and 40+ languages since May 2025 (https://blog.google/products-and-platforms/products/search/ai-overview-expansion-may-2025-update/).
- Gemini API grounding (developer surface): the model decides whether to search, runs one or more queries, returns groundingChunks / groundingSupports / url_citation spans; Search Suggestions must be displayed. Source: https://ai.google.dev/gemini-api/docs/google-search.

### 2.2 ChatGPT search (OpenAI)
- Crawlers (https://developers.openai.com/api/docs/bots): OAI-SearchBot/1.4 "used to surface websites in search results in ChatGPT's search features", respects robots.txt, IPs at https://openai.com/searchbot.json; "Sites that are opted out of OAI-SearchBot will not be shown in ChatGPT search answers". GPTBot/1.4 = training crawler, respects robots.txt. ChatGPT-User/1.0 = user actions: "Because these actions are initiated by a user, robots.txt rules may not apply." OAI-AdsBot validates ad landing pages. "each setting is independent of the others".
- Retrieval: ChatGPT "can turn requests into one or more search queries, retrieve relevant results, and use those results to generate an answer with links to sources"; OpenAI says search "leverages third-party search providers, as well as content provided directly by our partners". Sources: https://help.openai.com/en/articles/9237897-chatgpt-search ; https://openai.com/index/introducing-chatgpt-search/. Third-party measurement puts Bing-index overlap at ~87% (secondary, not official).
- Citation UI: inline citations plus a "Sources" panel; OpenAI's help text warns "Search results and citations can be incomplete, outdated, or incorrect".
- API surface: Responses API web_search returns url_citation annotations (url, title, start/end index); "inline citations must be made clearly visible and clickable"; allowed_domains up to 100; user_location (country/city/region/timezone). Source: https://developers.openai.com/api/docs/guides/tools-web-search.
- Volatility: Semrush measured Reddit's share of ChatGPT citations falling from ~60% to ~10% and Wikipedia from ~55% to <20% between August and mid-September 2025 (https://www.semrush.com/blog/most-cited-domains-ai/, 2025-11-10). Only 25.6% of cited domains overlap between ChatGPT's minimal and high reasoning modes on the same prompts (https://www.semrush.com/blog/chatgpt-reasoning-ai-visibility/, 2026-06-30).

### 2.3 Perplexity
- Crawlers (https://docs.perplexity.ai/docs/resources/perplexity-crawlers): PerplexityBot/1.0 "designed to surface and link websites in search results on Perplexity", respects robots.txt, IPs at https://www.perplexity.com/perplexitybot.json, changes take "up to 24 hours". Perplexity-User/1.0 "supports user actions within Perplexity... this fetcher generally ignores robots.txt rules", IPs at https://www.perplexity.com/perplexity-user.json.
- Retrieval: live retrieval against its own index plus partner content; the ranking formula is not published. Citation UI: numbered inline citations with source cards. The Sonar API returns citation URLs.
- Publisher economics: Comet Plus revenue share (80% to publishers) formalised January 2026 (secondary reporting).
- Caveat: Cloudflare (August 2025) alleged undeclared crawling that evades robots.txt; treat "respects robots.txt" as documented policy, not verified behaviour.

### 2.4 Claude (Anthropic)
- Crawlers (https://support.claude.com/en/articles/8896518, updated 2026-04-07): ClaudeBot (training), Claude-User ("When individuals ask questions to Claude, it may access websites"), Claude-SearchBot ("navigates the web to improve search result quality"). "Anthropic's Bots respect 'do not crawl' signals by honoring industry standard directives in robots.txt", stated for all three including the user-initiated one (unlike OpenAI, Perplexity and Google). IPs: https://claude.com/crawling/bots.json.
- Retrieval: web search launched on claude.ai 2025-03-20; Brave Search appears on Anthropic's subprocessor list from 2025-03-19 (TechCrunch / Simon Willison, secondary but consistent). The API web search tool is server-executed; "Claude determines when to search"; results carry page_age; "Citations are always enabled"; cited_text up to 150 chars; allowed_domains / blocked_domains; user_location; $10 per 1,000 searches; "When displaying API outputs directly to end users, citations must be included to the original source." Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool.
- Citation UI: inline numbered citations with a source list; no published ranking criteria.

### 2.5 Microsoft Copilot / Bing generative answers
- Crawler: bingbot (one index for Search and Copilot). Bing's Webmaster Guidelines were rewritten (reported 2026-02-27) to define GEO as "focused on content eligibility for grounding and reference in AI responses" and to state "GEO doesn't guarantee citations... just as SEO doesn't guarantee rankings". Sources: https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a (JS-rendered; fetched title-only on 2026-09-18) ; https://www.searchenginejournal.com/bing-adds-geo-to-official-guidelines-expands-ai-abuse-definitions/568442/.
- Controls (verbatim, Bing blog 2023-09-22, https://blogs.bing.com/webmaster/september-2023/Announcing-new-options-for-webmasters-to-control-usage-of-their-content-in-Bing-Chat): NOCACHE -> "We will only display URL/Snippet/Title in the answer"; NOARCHIVE -> "will not be included in Bing Chat answers, not be linked to in the answers". The 2026 guidelines add that NOSNIPPET / data-nosnippet "may reduce citation quality".
- Reporting: AI Performance report in Bing Webmaster Tools (public preview 2026-02-10): total citations, average cited pages, grounding queries ("key phrases the AI used when retrieving content"), page-level citations; June 2026 added Intents, Topics, Citation Share ("percentage of citations attributed to your site out of all citations shown across all sites for that same grounding query") and Compare. Microsoft's guidance: IndexNow, "depth and expertise", "clear headings, tables, and FAQ sections", "support claims with evidence", "keep content fresh and accurate", Bing Places. Sources: https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview ; https://blogs.bing.com/search/June-2026/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare.
- Bing states the report "is designed to support trend analysis... rather than precise accounting of individual AI answers" (help page, via secondary).

### 2.6 Gemini app (consumer)
- Generative by default with optional Google Search grounding; the Google-Extended token controls whether a site's content may be used for grounding in "Gemini Apps and Vertex AI" (Google crawler doc, 2026-07-14). Blocking Google-Extended can therefore remove a site from Gemini-app grounding while leaving AI Overviews untouched. Citation UI: source chips under the answer.

### 2.7 Mistral (Le Chat / Vibe)
- Documented fetcher MistralAI-User for user-triggered retrieval, said to respect robots.txt; training corpus via Common Crawl (CCBot). Secondary reporting only (https://www.menra.ai/guides/mistral-le-chat-crawler-guide); no first-party crawler page located.

### 2.8 Cross-engine facts an analyser can rely on
- Citations come from live retrieval on every surface above, not from training data; training crawlers (GPTBot, ClaudeBot, Google-Extended, CCBot) are separable from search/fetch agents and blocking them does not remove citations.
- JavaScript: Google renders JS in a queued second phase and itself notes "not all bots can run JavaScript" (https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics, 2026-03-04). No non-Google engine documents JS execution; Vercel's log study of 569M GPTBot requests found none (secondary). Content must exist in raw HTML to be safe on all engines.
- Fetch failures on 2026-09-18 (HTTP 403): https://openai.com/policies/row-terms-of-use/ ; https://openai.com/policies/terms-of-use/ ; https://help.openai.com/en/articles/12627856-publishers-and-developers-faq ; https://www.perplexity.ai/hub/legal/terms-of-service ; https://www.perplexity.ai/hub/legal/perplexity-api-terms-of-service. Their wording in Section 5 comes from consistent secondary reporting and must be re-verified before being quoted on a public page.

---
## 3. Evidence-tiered technique catalogue

Format per item: name | description | tier | sources (URL, date) | measurable proxy for a static HTML/text analyser | caveats.
"Proxy" means something computable from the fetched HTML, headers and robots.txt without calling an AI engine. "n/a" means the technique is real but not measurable from a page.

### 3A. Content-level techniques

**3A.1 Citing sources (outbound references with links)**
- Description: attribute claims to named, linked sources.
- Tier: A (conditional). Aggarwal et al. 2024 report "GEO can boost visibility by up to 40%" for the cite-sources / statistics / quotation rewrites on their in-context benchmark; the 2026 critical survey stresses the gain is "valid only within its experimental setting but conditional on a source already being present in a fixed context". C-SEO Bench (NeurIPS D&B 2025) found "most current C-SEO methods are not only largely ineffective but also frequently have a negative impact on document ranking"; per the survey, "only three of 54 method-domain combinations are significantly positive".
- Sources: https://arxiv.org/abs/2311.09735 (KDD 2024); https://arxiv.org/abs/2506.11097 (NeurIPS D&B 2025); https://arxiv.org/abs/2607.14035 (survey, July 2026). Bing guidance "support claims with evidence" (Feb 2026, Tier B on Bing).
- Proxy: count of outbound links to distinct external domains inside body text (excluding nav/footer); share of paragraphs containing a numeric claim that also contains an external link or "according to" attribution; ratio of .gov/.edu/.org/primary-source domains (Seer found definitional AIO winners cited ~2x more .gov/.edu outbound; Tier C).
- Caveats: effect demonstrated on being *used more* once retrieved, not on being retrieved; do not encode as a retrieval booster.

**3A.2 Statistics / numeric facts**
- Description: concrete numbers with units, dates and provenance.
- Tier: A (conditional, same basis as 3A.1); reinforced by arXiv 2604.25707 (602 prompts, 21,143 citations, Apr 2026): high-influence pages are "richer in extractable evidence such as definitions, numerical facts, comparisons, and procedural steps"; AWR passage study (small N, Sept 2026): "not one uncited passage contained a hard number or novel claim".
- Sources: as above plus https://arxiv.org/abs/2604.25707 ; https://www.advancedwebranking.com/blog/passages-quoted-vs-passages-absorbed-in-ai-answers (2026-09-18; N=112 passages).
- Proxy: density of numeric tokens with units/percent per 100 words in body text; share of those with an adjacent year or source; presence of a data table.
- Caveats: fabricated or unsourced numbers are a spam/E-E-A-T risk; do not reward raw digit density (prices/phone lists would inflate it).

**3A.3 Quotations from named experts**
- Tier: A (conditional; one of the three top methods in Aggarwal et al.); no independent replication of the quotation effect specifically.
- Proxy: count of blockquote/q elements or quoted spans >= 12 words with a following attribution pattern (name + role/organisation).
- Caveats: same as 3A.1; C-SEO Bench did not find a robust effect.

**3A.4 Authoritative / confident tone**
- Tier: D. Aggarwal et al. list it as a positive rewrite; C-SEO Bench found no significant effect; the survey warns "generic heuristics transfer poorly".
- Proxy: hedging-word rate ("may", "might", "it depends") per 100 words -- report only, no weight.
- Caveats: hedging is appropriate for uncertain topics; penalising it conflicts with Google's helpful-content guidance.

**3A.5 Fluency / readability**
- Tier: D. Same status as 3A.4; SAGEO Arena (Kim et al. 2026, via survey) found "body-only optimization reduces average top-20 presence by approximately 9%, top-10 by 16%, final citation by 6%", i.e. rewriting for the answer stage can hurt retrieval.
- Proxy: sentence length variance, readability index -- report only.

**3A.6 Technical terms / unique vocabulary**
- Tier: D. Listed in Aggarwal et al.; no replication. Bing's 2026 guideline "Keyword Stuffing and Artificially Engineered Language" explicitly targets language engineered for AI citation.
- Proxy: none recommended.

**3A.7 Answer-first structure (direct answer near the top of the page / section)**
- Tier: C. Google: "You don't need to write in a specific way just for generative AI search" and "There's no requirement to break your content into tiny pieces" (Tier B against over-engineering). Observational positional bias: Kevin Indig 44.2% of ChatGPT citations from the first 30% of content; CXL 55% from the top 30%; Petrovic ~one third of page content survives into grounding (all cited via AWR, 2026-09-18; primary datasets not re-read). The survey names "context position" one of the two most reproducible levers -- but that is position *inside the LLM context*, not position on the page.
- Proxy: share of body words that are in the first 30% of the document that also contain the page's H1 entity; presence of a <= 3-sentence summary paragraph before the first H2 (report as boolean).
- Caveats: the "40-60 word answer block" prescription has no source (Tier E, Section 4).

**3A.8 Question-shaped headings**
- Tier: D. Semrush observed that 35% (desktop) / 32% (mobile) of AIO-triggering keywords are questions (2025-07-22), which describes queries, not winning pages. No study isolates heading form. Google's fan-out means sub-questions are generated by the engine regardless of heading form.
- Proxy: share of H2/H3 that end with "?" or start with an interrogative -- report only, no weight.

**3A.9 Tables and lists (comparisons, procedural steps)**
- Tier: C. arXiv 2604.25707: comparisons and procedural steps among extractable-evidence features of high-influence pages. Evertune (May 2026, ~400M citations, 25k URLs, secondary): 63% of citations point to listicle pages. Ranqo/arXiv 2606.20065: ranked "best-of" listicle is the most-cited format (~21% of citations). Bing recommends "tables".
- Proxy: count of <table> with >= 2 columns and >= 3 rows; count of <ol>/<ul> with >= 3 items in main content; presence of a comparison table (header row containing >= 2 named entities).
- Caveats: format correlates with query type (comparisons, how-tos); do not reward tables on pages where they make no sense.

**3A.10 Content length**
- Tier: B (no target) / C (mixed observational). Google: "No ideal page length exists". Ahrefs (174,048 cited pages, 2025-12-03): mean 1,282 words, 53.4% under 1,000 words, Spearman 0.04 between length and citation ("essentially zero"). Seer (2026-05-28): winners cluster under 250 words and at 1,000-2,000; 5,000+ word guides take 4.4% of definitional slots. arXiv 2604.25707: high-influence pages "tend to be longer".
- Proxy: body word count -- report as a descriptive, not a score; flag < 150 words as "thin" only.

**3A.11 Entity named explicitly at first mention / consistent naming**
- Tier: C (small N) + B (Bing: "consistent entity representation across formats"). AWR passage study: cited passages named their entity at first mention 96% vs 82% for uncited (N=112).
- Proxy: does the first paragraph contain the page's primary entity string (from <title>/H1/og:site_name)? Variance of brand spelling across title, H1, Organization.name, og:site_name.

**3A.12 Original information (non-commodity content)**
- Tier: B. Google: "Creating content that people find unique, compelling, and useful will likely influence your website's presence in generative AI search"; avoid "commodity content". AWR: uncited passages were "pure consensus restatements" 82% of the time vs 61% for cited (N=112, Tier C).
- Proxy: not reliably computable statically; a judgement-based rubric item (see Section 6).

**3A.13 Freshness / dateModified**
- Tier: C (large-N observational) + B (date hygiene). Ahrefs (16.975M cited URLs, 7 platforms, 2025-07-28): AI-cited content 25.7% newer than organic by publish date (1,064 vs 1,432 days), 13.1% by last-updated; ChatGPT cites 458 days newer, AI Overviews 16 days *older*. Seer (4,124 pages, July 2026): 72% updated within a year vs 42% published within a year. Seer (5,000+ URLs, 2025-06-25): share of citations from current-year content: Perplexity 50%, AIO 44%, ChatGPT 31%. Google date guidance: show one clear visible date; use datePublished/dateModified in ISO 8601 (https://developers.google.com/search/blog/2019/03/help-google-search-know-best-date-for ; Article doc updated 2026-09-08). Bing: "keep content fresh and accurate".
- Proxy: presence of a visible date; Article.datePublished/dateModified present, ISO 8601, dateModified >= datePublished, and consistent with visible date and HTTP Last-Modified / sitemap lastmod; age in days of dateModified (descriptive).
- Caveats: cosmetic date bumping without content change is detectable (Google compares signals) and is not what the data rewards.

**3A.14 Author / expertise signals (bylines, author pages)**
- Tier: B (Google) / C-negative (citation correlation). Google: "While E-E-A-T itself isn't a specific ranking factor, using a mix of factors that can identify content with good E-E-A-T is useful"; Google "strongly encourage[s] adding accurate authorship information, such as bylines". Seer (2026-05-28): "The cohort with the highest author-bio rate (Perfect SEO publishers, 76%) has the lowest AIO share (1.94%)" -- described as inverse. Vendor claims of r=0.81 or "+40% lift" for author markup have no traceable dataset (Tier E).
- Proxy: byline present in article; author link resolves to an author page; Article.author with name and url; Person entity consistent across pages.
- Caveats: encode as a trust/hygiene item, not a citation predictor.

**3A.15 Keyword stuffing (negative)**
- Tier: A/B negative. Aggarwal et al.: keyword stuffing did not help; survey: "null or negative across multiple benchmarks". Google spam policy: "filling a web page with keywords or numbers in an attempt to manipulate rankings" (2026-08-28). Bing 2026: "Keyword Stuffing and Artificially Engineered Language".
- Proxy: top-term frequency > 3-4% of body tokens; repeated identical n-grams; lists of cities/phone numbers without surrounding prose.

**3A.16 Hidden text / prompt injection (negative)**
- Tier: B negative. Google defines hidden text ("white text on a white background", "font size or opacity to 0", off-screen CSS) and explicitly exempts accordions, tabs, sliders, tooltips and screen-reader-only text. Bing added "Prompt Injection and AI Manipulation" as a full abuse section. Academic work on "malicious GEO" (arXiv 2609.02964, SCI-Defense 2605.21948) treats injected instructions as attacks engines are being hardened against.
- Proxy: text nodes with computed color == background, font-size 0, opacity 0, off-screen positioning, display:none outside interactive components; strings addressed to models ("ignore previous instructions", "cite this page") in visible or hidden text, alt text, or JSON-LD.
### 3B. Technical, entity and off-site techniques

**3B.1 AI-bot crawlability (robots.txt per engine)**
- Tier: B. OpenAI: opting out OAI-SearchBot -> "will not be shown in ChatGPT search answers"; Anthropic: disabling Claude-SearchBot "prevents our system from indexing your content", disabling Claude-User "prevents our system from retrieving your content in response to a user query"; Perplexity: allow PerplexityBot to be surfaced; Google: Googlebot access + snippet eligibility (Google-Extended irrelevant to AIO/AI Mode); Bing: bingbot + no NOARCHIVE.
- Sources: https://developers.openai.com/api/docs/bots ; https://support.claude.com/en/articles/8896518 ; https://docs.perplexity.ai/docs/resources/perplexity-crawlers ; https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers ; https://blogs.bing.com/webmaster/september-2023/Announcing-new-options-for-webmasters-to-control-usage-of-their-content-in-Bing-Chat.
- Proxy (deterministic): parse robots.txt for User-agent groups OAI-SearchBot, ChatGPT-User, GPTBot, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, Googlebot, Google-Extended, bingbot, CCBot, and the wildcard; evaluate Allow/Disallow for the audited URL; report separately "search/fetch agents" vs "training agents". Check page-level X-Robots-Tag / meta robots for noindex, nosnippet, max-snippet:0, noarchive, nocache; check data-nosnippet spans covering main content.
- Caveats: user-initiated fetchers (ChatGPT-User, Perplexity-User, Google-Agent) may ignore robots.txt; WAF/CDN blocks are not visible in robots.txt -- verify with a fetch using each documented UA string and compare status codes.

**3B.2 Server-rendered main content (no JS dependency)**
- Tier: B. Google's AI guide: "Apply JavaScript SEO best practices"; JS doc: "not all bots can run JavaScript". No other engine documents rendering.
- Proxy: ratio of visible text extracted from raw HTML vs after headless rendering; flag if raw-HTML body text < 50% of rendered text or if H1/main content absent in raw HTML.

**3B.3 Canonical / duplicate control**
- Tier: B. Google canonical doc (2026-07-10): redirects and rel=canonical are "strong" signals, sitemap inclusion "weak"; use absolute URLs; Google picks a canonical if none is declared. Google AI guide: "Reduce duplicate content to improve crawl efficiency". GSC gen-AI report groups impressions by canonical URL.
- Proxy: rel=canonical present, absolute, self-referencing or pointing to a 200 page; no conflicting canonical between HTML and HTTP header; hreflang set consistent with canonical.

**3B.4 Semantic HTML landmarks and heading hierarchy**
- Tier: B (Google: "Use semantic HTML where feasible to improve accessibility"; Google notes agents use the accessibility tree). No study isolates landmark effects on citations.
- Proxy: exactly one <h1>; no skipped heading levels; <main> present; <article>/<nav>/<header>/<footer> used; images with alt; main-content text share of total page text.

**3B.5 Page speed / Core Web Vitals**
- Tier: B for Google Search ("Core Web Vitals are used by our ranking systems"; "other page experience aspects don't directly help your website rank higher") and for the AI guide ("good page experience... reduced latency"); D for any direct citation effect on other engines. Claims that Google tightened LCP to 2.0 s in March 2026 come from secondary blogs only -- not verified on developers.google.com; do not encode.
- Proxy: lab CWV (LCP, CLS, INP) via Lighthouse; HTML size; time-to-first-byte -- report as SEO hygiene, low weight.

**3B.6 JSON-LD structured data -- which types**
- Tier: B for Google's stated uses; D for AI-citation lift; measured effect on citations is null/slightly negative.
  - Organization (name, url, logo, sameAs, address, contactPoint): "helps Google better understand your organization's administrative details and disambiguate your organization in search results", feeds knowledge panels; "There are no required properties" (doc updated 2026-09-08). Tier B for entity disambiguation.
  - Article / NewsArticle / BlogPosting (author, datePublished, dateModified, headline, image): helps Google "show better title text, images, and date information" (doc 2026-09-08). Tier B for date/author understanding.
  - Product / Merchant Center feeds and Google Business Profile: Google's AI guide names these for shopping and local visibility in AI features. Tier B for those verticals.
  - FAQPage: rich result removed 2026-05-07; see Section 4. HowTo: removed 2023. Tier E as citation levers.
- Evidence on citations: Ahrefs (2026-05-11) 1,885 pages adding JSON-LD (Article, FAQ, Product, HowTo, Organization pooled) vs 4,000 controls, 30-day windows: Google AIO -4.6% (statistically significant), AI Mode +2.4% and ChatGPT +2.2% (indistinguishable from zero); "Adding schema produced no major uplift in citations on any platform." Google's guide: "Structured data isn't required for generative AI search, and there's no special schema.org markup you need to add". Seer: FAQ/HowTo-heavy cohort underperformed ~10x on first-citation share.
- Sources: https://ahrefs.com/blog/schema-ai-citations/ ; https://developers.google.com/search/docs/appearance/structured-data/organization ; https://developers.google.com/search/docs/appearance/structured-data/article ; https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data (JSON-LD recommended; markup must match visible content).
- Proxy: valid JSON-LD parse; Organization with sameAs >= 2 and consistent name/url; Article with author + both dates; markup values match visible text (name, dates, author). Score as "entity/date hygiene", never as "AI citation booster".

**3B.7 Entity consistency (sameAs, NAP, brand string)**
- Tier: B (Google Organization sameAs; Bing "consistent entity representation"). No controlled citation study.
- Proxy: sameAs links resolve (200) and point to profiles whose title contains the brand; identical organisation name across JSON-LD, <title>, footer, og:site_name; single canonical brand spelling.

**3B.8 llms.txt / llms-full.txt**
- Tier: E for citation effect; D as a future protocol. Google: "LLMS.txt files neither help nor harm rankings; Google Search ignores them"; John Mueller (2026-06-02): "purely speculative for now... none of the AI systems use it". SE Ranking (~300k domains, 2025-11-07): 10.13% adoption, Spearman + XGBoost/SHAP "no relationship", model improved when the variable was removed. AWR reports an Ahrefs crawl-log study (137,210 domains) in which 97% of valid llms.txt files received zero bot requests (primary URL not located; secondary). The llmstxt.org page (modified 2026-08-10) claims OpenAI, Anthropic and Gemini *publish* llms.txt for their own docs, which is not evidence that their engines *consume* it.
- Proxy: presence + well-formedness (H1, blockquote, H2 link lists) -- report as informational, weight 0.

**3B.9 FAQ content vs FAQPage schema**
- Tier: B (Bing lists "FAQ sections" among structure recommendations) for visible Q&A content; E for FAQPage markup as a citation lever (Section 4).
- Proxy: presence of a Q&A section (headings ending "?" followed by a paragraph) -- informational.

**3B.10 Internal linking / topical clusters**
- Tier: C. Seer (2026-05-28): definitional AIO winners "averaged more internal links"; Bing help suggests "stronger internal linking between related pages" (secondary). Google fan-out implies a site covering sub-questions is retrievable for more sub-queries (mechanistic, D).
- Proxy: count of in-content internal links to same-host URLs; count of inbound internal links to the audited URL (site-level crawl); descriptive anchor text share.

**3B.11 Third-party mentions (Reddit, Wikipedia, YouTube, LinkedIn, review sites)**
- Tier: C (large-N correlational). Ahrefs (75,000 brands, 2025-05-26, Spearman vs AIO mentions): branded web mentions 0.664, branded anchors 0.527, branded search volume 0.392, Domain Rating 0.326, referring domains 0.295, backlinks 0.218; brands in the top quartile for mentions averaged 169 AIO mentions vs 14 for the next quartile. Ahrefs follow-up (May 2026, press release): YouTube mentions ~0.737 across ChatGPT, AI Mode and AIO. Semrush ghost citations (2026-06-09): 61.7% of source links never name the brand; ChatGPT cites 87% / names 20.7%, Gemini cites 21.4% / names 83.7%. Profound (680M citations, Aug 2024-Jun 2025): ChatGPT top domain Wikipedia 7.8%, AIO Reddit 2.2%, Perplexity Reddit 6.6%. Ranqo/arXiv 2606.20065: household names appear in 73% of relevant answers vs 11% for niche brands.
- Sources: https://ahrefs.com/blog/ai-overview-brand-correlation/ ; https://www.semrush.com/blog/the-ghost-citations-study/ ; https://www.tryprofound.com/blog/ai-platform-citation-patterns ; https://arxiv.org/abs/2606.20065.
- Proxy: none from the page. Optional external module: count of brand mentions from a third-party index; presence of a Wikipedia/Wikidata entity; YouTube channel linked via sameAs. Report as "off-site context", unweighted in the page score.
- Caveats: correlation only; Google warns against "pursuing fake mentions"; shares shift by tens of points within weeks (Semrush num=100 episode).

**3B.12 Digital PR / earned media**
- Tier: C/D. Semrush (2026-07-30) cites Kevin Indig ("10% more reviews on G2 tend to have about 2% more AI citations") and a Trustpilot/Seer claim (profile claiming lifted citation rate "from 1% to 54%") -- both vendor-interested, no controls. Mechanism plausible via 3B.11.
- Proxy: n/a.

**3B.13 Multilingual / hreflang**
- Tier: B for correctness (Google: each version "must list itself as well as all other language versions"; untranslated main content is treated as duplicate; x-default recommended); D for any citation effect. Measurement point: query language explains 26.5% of answer variance (arXiv 2607.13304), so visibility must be measured per language, and AI Overviews coverage differs by market (40+ languages, 200+ countries; France gained AIO/AI Mode 2026-07-22 per secondary reporting).
- Proxy: hreflang set is reciprocal, includes self, uses absolute URLs, has x-default; lang attribute matches detected language of main text; translated body length within 30% of source.

**3B.14 IndexNow / sitemaps**
- Tier: B on Bing ("notify IndexNow when content is added, updated, or deleted"; sitemaps + IndexNow "strongest foundation" for AI-powered search, Bing blog July 2025). Not used by Google.
- Proxy: sitemap present and lists the URL with lastmod; IndexNow key file present (informational).

**3B.15 Gated / paywalled / PDF-only content**
- Tier: B (Google: content must be crawlable and snippet-eligible; NOARCHIVE excludes from Copilot). No engine can cite what it cannot fetch.
- Proxy: HTTP status for each documented UA; paywall markup (isAccessibleForFree) present; main content not only in PDF.

---

## 4. NOT supported / folklore list (do not encode as fact)

| Claim (as circulating, incl. in the baseline skill files) | Status | Why |
|---|---|---|
| "40-60 word answer blocks are optimal for AI extraction" | E | No provider publishes a word count; AWR (2026-09-18) traces the claim to nothing; the 252,000-trial "What Gets Cited" study found relevance and list position drive citation, not formatting. |
| "FAQ schema gets you cited / +60% citations" | E | FAQ rich results removed from Google Search 2026-05-07; Ahrefs controlled study: no uplift; Seer: FAQ/HowTo-heavy cohort underperformed ~10x. Visible Q&A content is fine (Bing recommends FAQ sections); the *markup* is inert. |
| "Schema markup gives 2.5-3.2x higher AI citation rates" | E | Vendor claims ("Princeton and Moz study", "BrightEdge 2.5-2.7x") have no locatable primary dataset; the one controlled study (Ahrefs, 1,885 pages) found -4.6% / +2.4% / +2.2%. |
| "llms.txt helps you get cited by ChatGPT/Claude/Perplexity" | E | Google: ignored; SE Ranking: no correlation on ~300k domains; ~97% of files never requested (Ahrefs via AWR). Publishing one is harmless. |
| "Content with schema shows 30-40% higher AI visibility on non-Google engines" (baseline skill) | E | Unsourced; contradicted by Ahrefs on ChatGPT (+2.2%, n.s.). |
| "Author bios / E-E-A-T markup lift citations by 40%" / "r=0.81" | E | Untraceable; Seer found an inverse relationship for author-bio coverage; Google says E-E-A-T "isn't a specific ranking factor". Bylines remain good practice (Tier B). |
| "Chunk content into AI-sized fragments" | E / counterproductive | Google: "There's no requirement to break your content into tiny pieces"; SAGEO Arena: body-only rewrites reduced top-10 retrieval ~16%. |
| "Write separate content for AI" / engine-specific recipes | E | Google warns it "risks scaled content abuse"; no provider documents per-engine content preferences; variation is mostly stochastic. |
| "Fixed refresh cadence (every 7/14/90 days) keeps you cited" | E | No evidentiary basis; freshness data are about *substantive* updates and time-sensitive topics. |
| "Blocking Google-Extended removes you from AI Overviews" | E | Google: Google-Extended "does not impact a site's inclusion in Google Search"; AIO/AI Mode run on Googlebot. It does affect Gemini-app grounding. |
| "AI Overviews reduce clicks by up to 58%" / "appear in ~45% of searches" (baseline skill) | C at best | Vendor-specific, query-set dependent (Semrush: 6.49% -> ~25% -> 15.69% of keywords through 2025); do not present as constants. |
| "Wikipedia = 7.8% of ChatGPT citations", "Reddit = 1.8%" (baseline skill) | stale C | Profound Aug 2024-Jun 2025; shares later swung to ~55%/~60% and back to <20%/~10% (Semrush, Sept 2025). Any share figure must carry a date. |
| "Optimized content gets cited 3x more; statistics boost visibility 40%+ across queries" (baseline skill) | E / A-conditional | The 40% is an in-context upper bound from one paper; "3x" is untraceable. |
| "Page speed is a citation signal for AI search" | D | Only a Google ranking input; no engine documents speed as a citation factor. |
| "Question headings are required for AI citation" | D | No isolating study; the engine generates its own sub-questions. |
| "Keyword variations for long-tail fan-out" | E | Google: "AI features can understand synonyms and general meanings". |
| OKF / "Open Knowledge Format" bundles as an AI-search signal (baseline skill) | D | Baseline file itself says "No confirmed AI-search ranking signal today"; treat like llms.txt. |

---
## 5. Measurement: rigorous AI visibility measurement

### 5.1 Why single observations are meaningless
- arXiv 2607.13304 (Zatuchin, July 2026; 12,933 responses, 20 brands, 8 languages, 3 models): within-prompt resampling accounts for 34.8% of response variance, query language 26.5%, brand-in-context interaction 29.6%, brand identity only 1.5%. Single-answer brand-ranking reliability ~0.01; full crossed design ~0.36. "Reliability is bought by spreading across languages and models, not by repeating one prompt"; marginal gain of a 6th repeat is ~0.0003 in relative-error variance.
- Weekly citation replacement: Google AI Mode 56%, ChatGPT 74% (SISTRIX, 82,619 prompts; via AWR 2026-09-18). Within-LLM variance 10-34% (AWR). Only 2.2% of cited sources identical across three repeated runs in one vendor test (secondary).
- ChatGPT reasoning depth changes the source set: 25.6% domain overlap between minimal and high reasoning; citations per response 2.6 -> 4.5; fan-out sub-queries 4.6x (Semrush, 100 prompts x 2 runs, 2026-06-30).
- Bing itself frames its AI Performance data as "trend analysis... rather than precise accounting of individual AI answers".

### 5.2 Sampling protocol (from the 2026 critical survey, arXiv 2607.14035)
- Repetitions: "Seven to eight repetitions constitute a reasonable starting point" (citing Schulte et al. 2026).
- Paraphrases: "three to five paraphrases per information need".
- Crossed dimensions: run x paraphrase x date x engine (add language and country, per 2607.13304).
- Controls: baseline, intervention, and "where possible, a placebo of comparable length".
- Human validation on a stratified sample: "citation attribution, claim support, sentiment".
- Multi-actor interference: test saturation "0, 25, 50, 75, and 100% of documents treated" because gains "approach zero under broad adoption" (C-SEO Bench).
- Practical cell size: with 8 repeats x 4 paraphrases = 32 samples per prompt-cell per engine per week; report citation rate with a Wilson interval, not a point estimate.

### 5.3 Wilson score intervals for citation / mention rates
- For n samples with k "brand cited" outcomes, p = k/n, z = 1.96:
  centre = (p + z^2/(2n)) / (1 + z^2/n); half-width = z * sqrt( p(1-p)/n + z^2/(4n^2) ) / (1 + z^2/n).
- Rationale: Wilson intervals have better coverage than Wald for small n and p near 0 or 1, and never produce zero-width or out-of-range intervals (https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval).
- Sizing: n=32 gives a half-width of ~0.17 at p=0.5 and ~0.11 at p=0.1; n=100 gives ~0.10 / ~0.06. Detecting a 10-point change between two periods needs roughly n >= 100 per cell. Treat any "share of voice" reported without n and an interval as unverified.
- Aggregate across cells with a hierarchical or stratified estimate (engine, language, intent), never by pooling raw runs, because variance components differ by engine and language.

### 5.4 Query-set design
- Stratify by intent using engine-native taxonomies: Bing AI Performance intents (Informational, Commercial, Navigational, Learn and Solve, Research, Creation, Local); Semrush buyer-journey stages (Problem, Exploration, Comparison, Validation, Selection).
- Include branded and unbranded prompts separately; Semrush shows mention and citation behave differently (ChatGPT 87% cite / 20.7% mention; Gemini 21.4% / 83.7%).
- Favour realistic, long-tail phrasings: Seer found AIO first-citation winners had mean query volume ~6,100/month vs ~178,000 for non-AIO keywords; question-shaped queries are the majority of AIO triggers (Semrush 35%/32%).
- Anticipate fan-out: log the engine's sub-queries where the API exposes them (Gemini webSearchQueries; Bing grounding queries; OpenAI/Anthropic search-call inputs) and measure retrieval per sub-query, since "topical relevance and context position" are the reproducible levers.
- Version the prompt set; when an engine changes (model, num=100 removal, reasoning mode), mark a break in series rather than smoothing over it.

### 5.5 Geography and language variables
- Fix and record: country/locale header, user_location (OpenAI, Anthropic, Perplexity where supported), interface language, logged-out state, device. AWR's single-day protocol (Thailand IP, US-English locale pinned, screenshots kept) is a reasonable minimum for reproducibility.
- Measure each target language as its own experiment (26.5% of variance); do not translate a prompt set and assume comparability.
- AI Overviews availability, and therefore denominator, differs by market (200+ countries, 40+ languages; feature roll-outs are staggered, e.g. France July 2026 per secondary reporting).

### 5.6 Provider terms on automated visibility monitoring (wording as of 2026-09-18)
| Provider | Consumer UI automation | Official API path | Notes |
|---|---|---|---|
| OpenAI | Terms of Use (row/EU): may not "use any automated or programmatic method to extract data or output from the Services, including scraping, web harvesting, or web data extraction" ... "except as permitted through the API". URL https://openai.com/policies/row-terms-of-use/ (fetch blocked 403 on 2026-09-18; wording via secondary reporting, re-verify). | Responses API web_search with url_citation annotations; "inline citations must be made clearly visible and clickable" (https://developers.openai.com/api/docs/guides/tools-web-search). | API answers are not identical to consumer ChatGPT (model/tool differences, reasoning mode). |
| Anthropic | Consumer Terms (effective 2025-10-08): prohibited "to access the Services through automated or non-human means, whether through a bot, script, or otherwise" and "to crawl, scrape, or otherwise harvest data"; exception "when you are accessing our Services via an Anthropic API Key or where we otherwise explicitly permit it" (https://www.anthropic.com/legal/consumer-terms). | Messages API web_search tool; citations always on; must be displayed to end users; $10/1,000 searches (https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool). | Enforcement against third-party harnesses tightened in 2026 (secondary). |
| Google | Terms of Service (effective 2026-07-30): prohibits "using automated means to access content from any of our services in violation of the machine-readable instructions on our web pages" and "using AI-generated content from our services to develop machine learning models" (https://policies.google.com/terms). Gemini API Additional Terms (2026-04-28): may not "implement any click tracking, Link-tracking or other monitoring of Grounded Results or Search Suggestions"; may store Grounded Result text up to 2 years only for limited purposes; no "programmatic or automated means to collect Links, using Links to build an index" (https://ai.google.dev/gemini-api/terms). | Gemini API Grounding with Google Search (developer surface, not AI Overviews); Search Console Generative AI report (impressions, first-party, no queries/clicks); Search generative AI control. | There is no official API for AI Overviews / AI Mode; scraping the SERP is against Google ToS. Gemini grounding data cannot lawfully be used for link-level monitoring dashboards under the API terms as written. |
| Perplexity | Terms of Service: prohibits "any robot, spider, crawlers, scraper, or other automatic device, process, software or queries that intercepts, 'mines,' scrapes, extracts, or otherwise accesses the Services to monitor, extract, copy or collect information" (https://www.perplexity.ai/hub/legal/terms-of-service; fetch blocked 403; wording via secondary, re-verify). 2026 update limits consumer plans to personal, non-commercial use (secondary). | Sonar API (API ToS updated 2026-01-23, fetch blocked) returns citations; standard responses omit some UI elements (related questions, numbered mapping) per secondary reporting. | Perplexity's own crawling conduct is disputed (Cloudflare 2025; Amazon injunction 2026). |
| Microsoft (Copilot/Bing) | Services Agreement (effective 2025-09-30): "Don't circumvent any restrictions on access... (e.g., attempting to 'jailbreak' an AI system or impermissible scraping)"; 14.s.iii "Unless explicitly permitted, you may not use web scraping, web harvesting, or web data extraction methods to extract data from the AI services"; 14.s.iv no training on outputs (https://www.microsoft.com/en-us/servicesagreement). | Bing Webmaster Tools AI Performance (first-party citations, grounding queries, citation share). | First-party report only covers your own verified site. |
| Mistral | Consumer Terms ROW (effective 2026-08-05): may not "use any method to extract any content from the Mistral AI Products other than as permitted"; web-search results may not be used to "copy, store, archive, cache, or create a database" (https://legal.mistral.ai/terms/row-consumer-terms). Commercial Terms (2026-08-05) carry the same extraction clause; consumer API access removed (secondary). | Commercial API. | Product renamed Vibe in 2026 terms (secondary). |

Implication for the product: build monitoring on official APIs, display citations as each provider requires, store aggregate metrics rather than raw grounded links where Google's terms forbid it, and label every metric with engine, model, locale, date, n and interval.

---

## 6. Recommended "GEO readiness score" model

Principle: the score measures *readiness* (what a page controls and engines document), not *visibility* (which is an external measurement, Section 5). Weights are a product design choice; the table below is a defensible starting point, not a finding. Publish the weights, version them, and keep Tier D/E items visible but at zero weight so users can see what was checked and why it does not count.

| Dimension | Type | Tier basis | Suggested weight | Example checks (proxies from Section 3) |
|---|---|---|---|---|
| 1. Retrievability & access | deterministic | B | 30% | robots.txt per engine agent (3B.1); noindex/nosnippet/max-snippet/NOARCHIVE/NOCACHE; HTTP 200 for each documented UA; canonical (3B.3); raw-HTML content share (3B.2); sitemap/IndexNow (3B.14); paywall/PDF-only (3B.15). Any hard block on a search agent caps the total score for that engine at 0. |
| 2. Extractable evidence | deterministic text metrics | A-conditional / C | 25% | sourced statistics density (3A.2); attributed quotations (3A.3); outbound reference links to primary sources (3A.1); comparison tables and procedural lists where the intent warrants (3A.9); entity named in first paragraph (3A.11); definition or summary before first H2 (3A.7). |
| 3. Provenance & freshness | deterministic | B / C | 20% | visible date; Article datePublished/dateModified valid and consistent with HTTP/sitemap (3A.13); byline and author page (3A.14); Organization JSON-LD with sameAs and consistent naming (3B.6, 3B.7). Scored as hygiene, never as "citation booster". |
| 4. Structure & semantics | deterministic | B | 10% | one H1, no skipped levels, landmarks, alt text (3B.4); heading/paragraph ratio; hreflang correctness where multilingual (3B.13). |
| 5. Hygiene (negative) | deterministic | A/B negative | -15% cap (subtracts) | keyword-stuffing density (3A.15); hidden text / prompt-injection strings (3A.16); thin or duplicate main content; markup that does not match visible text. |
| 6. Content quality | judgement (LLM- or human-rated rubric) | B (Google "unique, compelling, useful") | 15% | originality vs consensus restatement (3A.12); first-hand experience evident; claims supported; scope covers the fan-out sub-questions for the page's topic. Must be labelled as model-judged with the rubric published. |
| 7. Off-site context | external data, optional | C | 0% in page score; shown separately | third-party mentions, YouTube presence, Wikipedia/Wikidata entity, review-platform presence (3B.11, 3B.12). |
| Informational only | -- | D/E | 0% | llms.txt presence, FAQPage markup, question-heading share, word count, CWV lab numbers (reported for SEO context), OKF. |

Weight rationale (to be stated on the methodology page):
- Dimension 1 dominates because it is the only category every engine documents as a hard prerequisite and because it is fully deterministic.
- Dimension 2 carries the only peer-reviewed positive evidence, discounted because that evidence is in-context and did not replicate broadly (C-SEO Bench); hence 25% rather than the 40-50% a naive reading of the KDD paper would imply.
- Dimension 3 reflects large-N observational freshness data and official date/author/entity guidance; it is scored as hygiene because the controlled schema study found no citation lift.
- Dimension 6 is the only judgement-based dimension; keep it separable so users can view a deterministic-only score.
- Negative items subtract rather than being folded into positives, so a page cannot offset spam signals with more tables.

Per-engine applicability: expose a matrix rather than one number where it matters -- e.g. NOARCHIVE only affects Copilot; Google-Extended only affects Gemini-app grounding; Claude-User honours robots.txt while ChatGPT-User and Perplexity-User may not; IndexNow only affects Bing.

Confidence labelling: every check carries its tier letter and the source URL/date from Section 7; the public page should state that "A-conditional" means "shown in a controlled in-context experiment; not shown to improve retrieval or traffic".

Re-tiering triggers (schedule a review when any occurs): an engine publishes ranking criteria; a controlled study with N >= 1,000 pages contradicts a Tier B/C item; an engine changes robots/user-agent documentation; Google changes AI Overviews reporting or controls.

---
## 7. Source register (all accessed 2026-09-18)

| # | Organisation | Title | URL | Published / updated | Fetch status |
|---|---|---|---|---|---|
| 1 | Aggarwal et al. (Princeton/IIT Delhi), KDD 2024 | GEO: Generative Engine Optimization | https://arxiv.org/abs/2311.09735 | 2023-11 (v2 2024) | OK |
| 2 | Puerto et al., NeurIPS D&B 2025 | C-SEO Bench: Does Conversational SEO Work? | https://arxiv.org/abs/2506.11097 | 2025-06-06 | OK |
| 3 | arXiv (critical survey) | Optimizing Visibility in Generative Engines: A Critical Survey of GEO (2023-2026) | https://arxiv.org/abs/2607.14035 ; https://arxiv.org/html/2607.14035v1 | 2026-07-15 | OK |
| 4 | Zhang, He, Yao | From Citation Selection to Citation Absorption | https://arxiv.org/abs/2604.25707 | 2026-04-28 | OK |
| 5 | Tian et al. | Diagnosing and Repairing Citation Failures in GEO (AgentGEO) | https://arxiv.org/abs/2603.09296 | 2026-03-10 | OK |
| 6 | Zatuchin | Where Does the Noise Come From? Variance-components decomposition of non-determinism in LLM brand answers | https://arxiv.org/abs/2607.13304 | 2026-07-14 | OK |
| 7 | Kumar (Ranqo) | Generative Engine Optimization at Scale: Measuring Brand Visibility Across AI Search Engines | https://arxiv.org/abs/2606.20065 | 2026-06-18 | OK |
| 8 | arXiv position paper | GEO Creates Underexamined Risks... (ICML 2026 position track) | https://arxiv.org/abs/2606.12439 | 2026-05-18 | via search summary |
| 9 | arXiv | E-GEO: A Testbed for GEO in E-Commerce | https://arxiv.org/abs/2511.20867 | 2025-11 | via search summary |
| 10 | arXiv (ACL 2026) | IF-GEO: Conflict-Aware Instruction Fusion for Multi-Query GEO | https://arxiv.org/abs/2601.13938 | 2026-01 | via search summary |
| 11 | Google Search Central | Google's Guide to Optimizing for Generative AI Features on Google Search | https://developers.google.com/search/docs/fundamentals/ai-optimization-guide | updated 2026-07-10 | OK |
| 12 | Google Search Central | AI Features and Your Website | https://developers.google.com/search/docs/appearance/ai-features | updated 2025-12-10 | OK |
| 13 | Google Search Central Blog | A new resource for optimizing for generative AI in Google Search | https://developers.google.com/search/blog/2026/05/a-new-resource-for-optimizing | 2026-05-15 | via search summary |
| 14 | Google Search Central | Google's common crawlers (Googlebot, Google-Extended) | https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers | updated 2026-07-14 | OK |
| 15 | Google Search Central | User-triggered fetchers (Google-Agent etc.) | https://developers.google.com/search/docs/crawling-indexing/google-user-triggered-fetchers | updated 2026-08-19 | OK |
| 16 | Google Search Console Help | Generative AI performance report (Search) | https://support.google.com/webmasters/answer/16984139 | updated 2026-08-31 | OK |
| 17 | Google Search Console Help | Search generative AI control | https://support.google.com/webmasters/answer/16908024 | 2026 | OK |
| 18 | Google Search Central Blog | Introducing Search Generative AI performance reports in Search Console | https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports | 2026-06-03 | archive page only; content via #16 |
| 19 | Google Search Central | Spam policies for Google web search | https://developers.google.com/search/docs/essentials/spam-policies | updated 2026-08-28 | OK |
| 20 | Google Search Central | Creating helpful, reliable, people-first content (E-E-A-T, Who/How/Why) | https://developers.google.com/search/docs/fundamentals/creating-helpful-content | updated 2025-12-10 | OK |
| 21 | Google Search Central | Intro to structured data (JSON-LD recommended) | https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data | updated 2025-12-10 | OK |
| 22 | Google Search Central | Organization structured data | https://developers.google.com/search/docs/appearance/structured-data/organization | updated 2026-09-08 | OK |
| 23 | Google Search Central | Article structured data | https://developers.google.com/search/docs/appearance/structured-data/article | updated 2026-09-08 | OK |
| 24 | Google Search Central | FAQPage structured data (deprecation notice) | https://developers.google.com/search/docs/appearance/structured-data/faqpage | notice May 2026 | OK |
| 25 | Google Search Central Blog | Changes to HowTo and FAQ rich results | https://developers.google.com/search/blog/2023/08/howto-faq-changes | 2023-08-08 | archive listing; content via #26 |
| 26 | Search Engine Journal | Google Drops FAQ Rich Results From Search | https://www.searchenginejournal.com/google-drops-faq-rich-results-from-search/574429/ | 2026-05-10 | OK |
| 27 | Google Search Central | Understanding page experience (Core Web Vitals) | https://developers.google.com/search/docs/appearance/page-experience | updated 2025-12-10 | OK |
| 28 | Google Search Central | JavaScript SEO basics | https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics | updated 2026-03-04 | OK |
| 29 | Google Search Central | Consolidate duplicate URLs (canonical) | https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls | updated 2026-07-10 | OK |
| 30 | Google Search Central | Localized versions of your pages (hreflang) | https://developers.google.com/search/docs/specialty/international/localized-versions | updated 2025-12-22 | OK |
| 31 | Google Search Central Blog | Help Google Search know the best date for your web page | https://developers.google.com/search/blog/2019/03/help-google-search-know-best-date-for | 2019-03 | archive listing; content via search summary |
| 32 | Google | AI Overviews expand to 200+ countries, 40+ languages | https://blog.google/products-and-platforms/products/search/ai-overview-expansion-may-2025-update/ | 2025-05 | via search summary |
| 33 | Google AI for Developers | Grounding with Google Search (Gemini API) | https://ai.google.dev/gemini-api/docs/google-search | 2026 | OK |
| 34 | Google AI for Developers | Gemini API Additional Terms of Service | https://ai.google.dev/gemini-api/terms | updated 2026-04-28 | OK |
| 35 | Google | Google Terms of Service | https://policies.google.com/terms | effective 2026-07-30 | OK |
| 36 | Google | Generative AI Additional Terms (legacy) | https://policies.google.com/terms/generative-ai | 2023-08-09 (superseded) | OK |
| 37 | Search Engine Journal | Google Says LLMs.txt Is Purely Speculative For Now (Mueller, Reddit) | https://www.searchenginejournal.com/google-says-llms-txt-is-purely-speculative-for-now/577576/ | 2026-06 | OK |
| 38 | OpenAI | Overview of OpenAI crawlers (OAI-SearchBot, GPTBot, ChatGPT-User, OAI-AdsBot) | https://developers.openai.com/api/docs/bots | 2026 | OK (redirect from platform.openai.com/docs/bots) |
| 39 | OpenAI Help | Searching the web with ChatGPT | https://help.openai.com/en/articles/9237897-chatgpt-search | 2026 | via search summary |
| 40 | OpenAI | Introducing ChatGPT search | https://openai.com/index/introducing-chatgpt-search/ | 2024-10-31 | via search summary |
| 41 | OpenAI | Web search (Responses API) | https://developers.openai.com/api/docs/guides/tools-web-search | 2026 | OK |
| 42 | OpenAI | Terms of Use (ROW / EU) | https://openai.com/policies/row-terms-of-use/ ; https://openai.com/policies/eu-terms-of-use/ | 2026 | 403 -- wording via secondary |
| 43 | OpenAI Help | Publishers and Developers FAQ | https://help.openai.com/en/articles/12627856-publishers-and-developers-faq | 2026 | 403 |
| 44 | Anthropic | Does Anthropic crawl data from the web...? (ClaudeBot, Claude-User, Claude-SearchBot) | https://support.claude.com/en/articles/8896518 | updated 2026-04-07 | OK |
| 45 | Anthropic | Web search tool (Claude API) | https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool | 2026 | OK |
| 46 | Anthropic | Consumer Terms of Service | https://www.anthropic.com/legal/consumer-terms | effective 2025-10-08 | OK |
| 47 | TechCrunch / S. Willison | Anthropic appears to be using Brave to power web search | https://techcrunch.com/2025/03/21/anthropic-appears-to-be-using-brave-to-power-web-searches-for-its-claude-chatbot/ ; https://simonwillison.net/2025/Mar/21/anthropic-use-brave/ | 2025-03-21 | via search summary |
| 48 | Perplexity | Perplexity Crawlers (PerplexityBot, Perplexity-User) | https://docs.perplexity.ai/docs/resources/perplexity-crawlers | 2026 | OK |
| 49 | Perplexity | Terms of Service | https://www.perplexity.ai/hub/legal/terms-of-service | 2026 | 403 -- wording via secondary |
| 50 | Perplexity | API Terms of Service | https://www.perplexity.ai/hub/legal/perplexity-api-terms-of-service | updated 2026-01-23 | 403 |
| 51 | Cloudflare | Perplexity is using stealth, undeclared crawlers | https://blog.cloudflare.com/perplexity-is-using-stealth-undeclared-crawlers-to-evade-website-no-crawl-directives/ | 2025-08 | via search summary |
| 52 | Microsoft Bing | Webmaster Guidelines (GEO section) | https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a | 2026-02 | JS-rendered; title only |
| 53 | Microsoft Bing | Robots meta tags and attributes that Bing supports | https://www.bing.com/webmasters/help/robots-meta-tags-and-attributes-that-bing-supports-5198d240 | 2026 | JS-rendered; title only |
| 54 | Microsoft Bing | AI Performance help | https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c | 2026 | JS-rendered; title only |
| 55 | Search Engine Journal | Bing Adds GEO To Official Guidelines, Expands AI Abuse Definitions | https://www.searchenginejournal.com/bing-adds-geo-to-official-guidelines-expands-ai-abuse-definitions/568442/ | 2026-02-27 | OK |
| 56 | Microsoft Bing Blog | Announcing new options for webmasters to control usage of their content in Bing Chat (NOCACHE/NOARCHIVE) | https://blogs.bing.com/webmaster/september-2023/Announcing-new-options-for-webmasters-to-control-usage-of-their-content-in-Bing-Chat | 2023-09-22 | OK |
| 57 | Microsoft Bing Blog | Introducing AI Performance in Bing Webmaster Tools (public preview) | https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview | 2026-02-10 | OK |
| 58 | Microsoft Bing Blog | New AI Visibility Insights: Intents, Topics, Citation Share, Compare | https://blogs.bing.com/search/June-2026/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare | 2026-06-16 | OK |
| 59 | Microsoft Bing Blog | Keeping Content Discoverable with Sitemaps in AI-Powered Search | https://blogs.bing.com/webmaster/July-2025/Keeping-Content-Discoverable-with-Sitemaps-in-AI-Powered-Search | 2025-07 | via search summary |
| 60 | Microsoft | Microsoft Services Agreement | https://www.microsoft.com/en-us/servicesagreement | effective 2025-09-30 | OK |
| 61 | Mistral AI | Terms of Service for consumers outside the EU | https://legal.mistral.ai/terms/row-consumer-terms | effective 2026-08-05 | OK |
| 62 | Mistral AI | Commercial Terms of Service | https://legal.mistral.ai/terms/commercial-terms-of-service | effective 2026-08-05 | OK |
| 63 | Mistral AI | Terms of Service for consumers in the EU | https://legal.mistral.ai/terms/eu-consumers-terms-of-service | 2025-11-28 | truncated fetch |
| 64 | Menra | Mistral Le Chat crawlers explained (MistralAI-User) | https://www.menra.ai/guides/mistral-le-chat-crawler-guide | 2026 | secondary only |
| 65 | llmstxt.org (J. Howard) | The /llms.txt file | https://llmstxt.org/ | 2024-09-03, modified 2026-08-10 | OK |
| 66 | SE Ranking | LLMs.txt: Why Brands Rely On It and Why It Doesn't Work (300k domains) | https://seranking.com/blog/llms-txt/ | 2025-11-07 | OK |
| 67 | Ahrefs | Do AI assistants prefer to cite fresh content? (16.975M URLs) | https://ahrefs.com/blog/do-ai-assistants-prefer-to-cite-fresh-content | 2025-07-28 | OK |
| 68 | Ahrefs | An Analysis of AI Overview Brand Visibility Factors (75K brands) | https://ahrefs.com/blog/ai-overview-brand-correlation/ | 2025-05-26 | OK |
| 69 | Ahrefs (Business Wire) | Across 75,000 Brands, YouTube Mentions Are the Strongest Signal of AI Visibility | https://www.businesswire.com/news/home/20260526119691/en/ | 2026-05-26 | via search summary |
| 70 | Ahrefs | Does ranking higher on Google mean you'll get cited in AI Overviews? (1M keywords) | https://ahrefs.com/blog/does-ranking-higher-on-google-mean-youll-get-cited-in-ai-overviews | 2025-07-21 | OK |
| 71 | Ahrefs | Only 12% of AI-cited URLs rank in Google's top 10 (15k queries) | https://ahrefs.com/blog/ai-search-overlap/ | 2025-08-11 | OK |
| 72 | Ahrefs (via SEJ) | AI Overview citations from top-10 pages drop from 76% to 38% | https://www.searchenginejournal.com/google-ai-overview-citations-from-top-ranking-pages-drop-sharply/568637/ | 2026-03 | via search summary |
| 73 | Ahrefs | We Tracked 1,885 Pages Adding Schema. AI Citations Barely Moved. | https://ahrefs.com/blog/schema-ai-citations/ | 2026-05-11 | OK |
| 74 | Ahrefs | Short vs. Long Content in AI Overviews (174,048 pages) | https://ahrefs.com/blog/short-vs-long-content-in-ai-overviews/ | 2025-12-03 | OK |
| 75 | Ahrefs | Why ChatGPT Cites One Page Over Another (1.4M prompts) | https://ahrefs.com/blog/why-chatgpt-cites-pages/ | 2026-04-15 | OK |
| 76 | Semrush | We Studied 200,000 AI Overviews | https://www.semrush.com/blog/ai-overviews-study/ | 2025-07-22 | OK |
| 77 | Semrush | The Most-Cited Domains in AI: A 3-Month Study (230k prompts, 100M citations) | https://www.semrush.com/blog/most-cited-domains-ai/ | 2025-11-10 | OK |
| 78 | Semrush | Why 62% of AI citations don't lead to brand mentions (ghost citations) | https://www.semrush.com/blog/the-ghost-citations-study/ | 2026-06-09 | OK |
| 79 | Semrush | Only 25% of cited sources overlap between ChatGPT reasoning modes | https://www.semrush.com/blog/chatgpt-reasoning-ai-visibility/ | 2026-06-30 | OK |
| 80 | Semrush | 2026 AI Visibility Index (126M prompts) -- methodology | https://ai-visibility-index.semrush.com/methodology ; https://www.semrush.com/news/463141-semrush-releases-expanded-2026-ai-visibility-index-analyzing-126-million-ai-search-prompts/ | 2026-06-26 | OK (no repetition/CI stated) |
| 81 | Semrush | Digital PR for AI visibility | https://www.semrush.com/blog/digital-pr-for-ai-visibility/ | 2026-07-30 | OK |
| 82 | Semrush | Why AI is citing third-party sources instead of your site | https://www.semrush.com/blog/ai-citing-my-site-vs-third-party-sources/ | 2026-04-27 | OK |
| 83 | Profound | AI Platform Citation Patterns (680M citations) | https://www.tryprofound.com/blog/ai-platform-citation-patterns | 2025-06-05 (upd. 2025-08) | OK |
| 84 | BrightEdge | AI Overview Citations Now 54% from Organic Rankings (16 months) | https://www.brightedge.com/resources/weekly-ai-search-insights/rank-overlap-after-16-months-of-aio | 2025-09-18 | OK |
| 85 | Seer Interactive | Study: AI Brand Visibility and Content Recency | https://www.seerinteractive.com/insights/study-ai-brand-visibility-and-content-recency | 2025-06-25 | OK |
| 86 | Seer Interactive | What It Takes To Rank In Google's AI Overviews in 2026 Isn't What You Think | https://www.seerinteractive.com/insights/what-it-takes-to-rank-in-googles-ai-overviews-in-2026-is-not-what-you-think | 2026-05-28 | OK |
| 87 | Seer Interactive | Generative Engine Optimization hub (recency 2026 study, fan-out study) | https://www.seerinteractive.com/generative-engine-optimization | updated 2026-08 | OK |
| 88 | Advanced Web Ranking | What Gets Quoted and What Gets Absorbed: A Passage-Level Study | https://www.advancedwebranking.com/blog/passages-quoted-vs-passages-absorbed-in-ai-answers | 2026-09-18 | OK |
| 89 | Advanced Web Ranking | AI Search Optimization Best Practices: Proven, Plausible, Hype | https://www.advancedwebranking.com/blog/ai-search-optimization-best-practices | 2026-09-18 | OK (secondary for Indig, CXL, SISTRIX, Ahrefs llms.txt log study) |
| 90 | Wikipedia | Binomial proportion confidence interval (Wilson score) | https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval | ongoing | via search summary |
| 91 | Local baseline (input only) | ai-seo SKILL.md v2.4.0 + references/ ; ccg seo-growth.md | C:/Users/NicolasSimon/.claude/skills/ai-seo/SKILL.md ; C:/Users/NicolasSimon/.claude/skills/ccg/domains/seo/seo-growth.md | 2026-09-01 | read |

### Open items to close before publishing the methodology page
1. Re-fetch and quote directly: OpenAI Terms of Use, OpenAI Publishers FAQ, Perplexity Terms and API Terms, Bing Webmaster Guidelines and robots-meta pages (need a JS-capable fetch).
2. Locate primary datasets for the positional-bias figures (Indig 44.2%, CXL 55%), the SISTRIX 82,619-prompt replacement rates, and the Ahrefs llms.txt crawl-log study; until then they stay Tier C via AWR.
3. Confirm whether the Ahrefs 0.737 YouTube coefficient is Spearman across all three engines (press release wording) by reading the May 2026 blog post.
4. Decide, with legal, whether Gemini API grounding output may feed any stored per-link metric given the "no monitoring of Grounded Results" clause.
