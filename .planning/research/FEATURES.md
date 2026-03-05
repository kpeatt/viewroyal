# Feature Landscape

**Domain:** Civic intelligence platform v1.7 enhancements (RAG, profiling, UX, pipeline, email)
**Researched:** 2026-03-05

## Table Stakes

Features users expect once the existing v1.0-1.6 foundation is in place. Missing = platform feels half-finished for returning users.

| Feature | Why Expected | Complexity | Dependencies on Existing | Notes |
|---------|--------------|------------|-------------------------|-------|
| LLM reranking of RAG results | Users already get AI answers; poor retrieval quality is noticeable when the answer misses obvious context or cites irrelevant segments. Reranking is the single highest-ROI RAG improvement. | Medium | Existing hybrid search RPCs (4 content types), Gemini API, RRF scoring | Pointwise scoring with Gemini Flash is simplest. Score each retrieved chunk 1-5 for relevance before passing to synthesis. Gemini Flash benchmarks at 0.68 NDCG@10 -- not as good as purpose-built cross-encoders but eliminates a new dependency. Inject existing RRF/BM25 scores into the prompt for 3-16% further gains per InsertRank research. |
| Meeting summary cards | Every meeting page already has a `summary` field and agenda items. Users landing on meetings list expect a quick "what happened" preview without clicking through. | Low | `meetings.summary`, `agenda_items.plain_english_summary`, existing motions data | Card should show: meeting date/type, 1-2 sentence summary, count of decisions, whether any votes were divided, attendance count. Data already exists -- this is a pure frontend feature. |
| Meeting outcome badges | Users see motions with text results ("CARRIED", "DEFEATED") but lack visual scan-ability. Colored badges per outcome are standard in any decision-tracking UI. | Low | `motions.result` field, existing MotionsOverview component | Simple mapping: CARRIED = green badge, DEFEATED = red badge, TABLED/DEFERRED = amber badge, WITHDRAWN = gray badge. Already have Badge component from shadcn/ui. |
| Improved email digest design | Current digest HTML is functional but dense. Users receiving digests expect scannable, mobile-friendly emails with clear hierarchy. | Low-Med | Existing `send-alerts` Edge Function, Resend integration, `build_meeting_digest` RPC | Current email uses inline styles correctly (email-safe). Improvements: add meeting summary at top, group decisions by outcome, add "TL;DR" one-liner, improve mobile padding, add unsubscribe one-click link per CAN-SPAM / CASL. |
| RAG observability and feedback | Users who get bad answers have no way to report it. Developers have no way to measure RAG quality. Without feedback loops, quality stagnates. | Medium | `rag.server.ts` orchestrator/synthesis pipeline, existing streaming SSE | Minimum: thumbs up/down on AI answers stored in a `rag_feedback` table. Track: question, answer hash, tool calls made, latency, user rating. This is the eval foundation for every other RAG improvement. |

## Differentiators

Features that set ViewRoyal.ai apart from generic civic platforms. Not expected, but create the "wow" moment.

| Feature | Value Proposition | Complexity | Dependencies on Existing | Notes |
|---------|-------------------|------------|-------------------------|-------|
| AI-generated council member profiles | No other small-municipality civic platform auto-generates comprehensive "who is this councillor" profiles from voting/speaking data. Currently stances exist but are per-topic; a synthesized profile overview is the differentiator. | Medium-High | `councillor_stances` table, `councillor_highlights` table, speaking time RPCs, voting history, `key_statements` | Generate a ~200-word narrative profile per councillor: top 3 policy priorities (derived from speaking time + stance data), voting tendencies (consensus vs. independent), notable positions. Store in a `councillor_profiles` table. Regenerate when new meeting data arrives. Must include "generated from X meetings, Y votes" provenance to maintain credibility. |
| Topic taxonomy and issue clustering | Current topics are hardcoded via `normalize_category_to_topic()` SQL function mapping ~300 CivicWeb categories to 8 broad topics. A real taxonomy would let users explore "Housing > Affordable Housing > 123 Main St rezoning" hierarchically. | High | `normalize_category_to_topic()` function, `topics` table, `agenda_items.category` field, matter categories | Two-tier approach: (1) Keep existing 8 normalized topics as top-level categories. (2) Use LLM clustering on agenda item titles + summaries to generate sub-topics within each category. Store as `topic_id` + `subtopic` on agenda items. Enables "show me everything about affordable housing" filtering. Full unsupervised taxonomy construction (TaxoGen-style) is overkill for ~700 meetings -- LLM-assisted labeling within known top-level categories is more practical. |
| Persistent conversation memory | Current 5-turn memory passes previous Q&A as a `context` string parameter via URL. True persistent memory would let users return days later and continue a research thread. | Medium-High | Current `context` parameter in `api.ask.tsx`, client-side conversation state in `search.tsx` | Requires: `rag_conversations` table (id, user_id, created_at), `rag_messages` table (conversation_id, role, content, tool_calls, created_at). Client sends `conversation_id` instead of raw context string. Server loads last N turns from DB. Unauthenticated users get session-scoped memory (localStorage conversation_id). Authenticated users get persistent cross-session memory. |
| Financial transparency per agenda item | `agenda_items.financial_cost` and `motions.financial_cost` fields exist in the schema but are rarely surfaced. Showing "$X approved this meeting" rollups would be unique among small-municipality platforms. | Low-Med | `agenda_items.financial_cost`, `motions.financial_cost`, `agenda_items.funding_source` fields (already in schema/types) | Surface as: per-meeting financial summary card ("Council approved $X in spending"), per-agenda-item cost badges, per-motion cost display. Must verify these fields are actually populated by the pipeline -- they exist in TypeScript types but may be aspirational. Check actual DB population before building UI. |
| Speaker identification improvements | Pipeline already does MLX diarization with voice fingerprints. Improving accuracy means fewer "Unknown Speaker" segments, which improves RAG answer attribution and profile accuracy. | High | `voice_fingerprint_id` on people table, MLX diarization pipeline, `speaker_aliases` table, `transcript_segments.person_id` | Current system: diarize then manually alias speaker labels to people. Improvement: build a speaker embedding database from known segments (where `person_id` is set). On new meetings, compare diarized embeddings against the database for automatic identification. Threshold-based matching (cosine similarity > 0.85) auto-assigns; below threshold flags for review. Pipeline-only change -- no web UI needed initially. |
| Council member profile page redesign | Current profile page has stats but no narrative "at a glance" section. A redesigned page with summary card, policy position grid, and voting pattern visualization would be a clear differentiator. | Medium | All existing profile data: stances, highlights, speaking time, voting history, attendance, alignment scores | Layout: hero card with photo/role/tenure, AI-generated overview paragraph, "Top Issues" grid (3-4 topic cards with stance indicators), voting pattern donut chart, recent activity timeline. Most data already fetched by the 15-query `getPersonProfile()` function. |
| RAG redesigned tool set | Current RAG has 9 tools plus `get_current_date`. Some overlap (e.g., `search_agenda_items` and `search_key_statements` both surface discussion content from different angles). A redesigned tool set would consolidate and add smarter routing. | Medium | All 9 existing RAG tools in `rag.server.ts`, orchestrator prompt strategy guide | Consolidation: merge `search_transcript_segments` and `search_key_statements` into a unified `search_discussions` tool that returns both. Add a `get_meeting_summary` tool for "what happened at the last meeting" questions. Add `search_financial` tool wrapping financial_cost queries. Fewer, more purposeful tools reduce orchestrator LLM confusion and wasted tool calls. |
| Upcoming meeting alerts with join link | Pre-meeting emails exist but don't include a direct link to the live stream. Citizens want one-click access to watch a meeting that's about to start. | Low | Existing pre-meeting alert flow in `send-alerts` Edge Function, YouTube live stream URL | Add YouTube channel link prominently in pre-meeting email (already partially there in the "Want to attend?" section). For meetings in progress, add a "Watch Now" CTA. Attendance data is typically recorded during/after meetings, so pre-meeting attendance info is limited to expected attendees based on memberships. |

## Anti-Features

Features to explicitly NOT build for v1.7.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full budget explorer / interactive visualization | Scope creep. Budget data doesn't flow through the pipeline -- it would require a separate data source, new scraper, and new data model. The `financial_cost` fields on agenda items are per-item extractions, not a full municipal budget. | Surface per-item and per-meeting financial rollups from existing `financial_cost` fields. Defer full budget visualization to a future milestone if user demand materializes. |
| Real-time RAG tool call visibility | Showing the orchestrator's "thinking" (tool selections, intermediate results) to users is technically interesting but confuses non-technical civic users. v1.6 already improved agent reasoning display with tool-type icons. | Keep streaming final answer. Add observability/logging server-side for quality debugging. The existing citation badges with hover preview serve the "show your work" need. |
| Sentiment analysis badges on transcript segments | The `sentiment_score` field exists on `transcript_segments` but sentiment analysis on civic proceedings is fraught -- "passionate advocacy" reads as "angry" to models. Creates a misleading impression of bias. | Focus on stance analysis (supports/opposes/mixed) which is grounded in voting behavior, not tone interpretation. Sentiment scores can remain in the pipeline for internal analysis but should not be user-facing. |
| Social/collaborative features | Undermines the platform's credibility as an objective civic record. User annotations risk looking like official commentary. Per PROJECT.md: "Social features -- undermines official record credibility." | Keep the platform read-only with personal subscriptions. The RAG Q&A serves the "research assistant" role without social dynamics. |
| Multi-municipality topic comparison | Comparing "how does View Royal's housing policy compare to Esquimalt's" requires both municipalities ingested with normalized topic taxonomies. RDOS/multi-muni is deferred to v1.8. | Build topic taxonomy for View Royal only. Design the schema to be municipality-scoped so it's ready for cross-municipality comparison later. |
| Push notifications / native app wrapper | Out of scope per PROJECT.md. Overkill for current user base size. | Email alerts are the notification channel. Improve design and content quality instead. |
| SMS notifications | Cost/compliance overhead unjustified at current scale per PROJECT.md. | Email-only for v1.7. |

## Feature Dependencies

```
RAG Observability & Feedback ────────────> LLM Reranking (need eval baseline before measuring reranking gains)
                              └──────────> RAG Tool Redesign (need feedback data to know which tools underperform)

Topic Taxonomy ──────────────────────────> AI Council Member Profiles (profiles reference topic taxonomy)
                              └──────────> Topic-based clustering in search UI (depends on taxonomy existing)

Speaker Fingerprinting (pipeline) ───────> AI Council Member Profiles (better attribution = better profiles)
                              └──────────> More accurate speaking time stats

Meeting Summary Cards ───────────────────> (standalone, no blockers -- data exists)

Meeting Outcome Badges ──────────────────> (standalone, no blockers -- Badge component exists)

Persistent Conversation Memory ──────────> (standalone, but benefits from RAG observability for debugging)

Email Digest Redesign ───────────────────> (standalone, existing Edge Function)

Financial Transparency ──────────────────> VERIFY pipeline populates financial_cost fields first
                                           (if not populated, this becomes a pipeline extraction task)

Council Member Profile Redesign ─────────> AI Council Member Profiles (needs generated profile data)
                              └──────────> Topic Taxonomy (topic cards on profile page reference taxonomy)
```

## MVP Recommendation

**Phase 1 -- Quick wins and eval foundation (ship fast, 1-2 weeks):**
1. Meeting summary cards (pure frontend, data exists in `meetings.summary`)
2. Meeting outcome badges (pure frontend, Badge component exists)
3. RAG observability and feedback (`rag_feedback` table + thumbs up/down UI -- needed before any RAG changes)
4. Email digest design improvements (incremental HTML changes to Edge Function)

**Phase 2 -- RAG intelligence (highest user-visible impact, 2-3 weeks):**
5. LLM reranking with Gemini Flash pointwise scoring (measure improvement against feedback baseline)
6. RAG tool set redesign (consolidate overlapping tools, add `get_meeting_summary`)
7. Conversation memory persistence (new tables, client sends `conversation_id`)

**Phase 3 -- Council member intelligence (deepest differentiator, 2-3 weeks):**
8. Topic taxonomy (LLM-assisted sub-topic clustering within existing 8 normalized categories)
9. AI-generated council member profiles (synthesize from stances + voting + speaking data)
10. Council member profile page redesign (frontend consuming new profile data)

**Phase 4 -- Pipeline and polish (1-2 weeks):**
11. Speaker fingerprinting improvements (pipeline-only, build embedding database from known segments)
12. Financial transparency (verify data population in DB, then surface in UI)
13. Upcoming meeting alert improvements (better CTAs, live stream link prominence)

**Defer to later:**
- Full budget explorer (no data source exists in the pipeline)
- Cross-session conversation memory for unauthenticated users (session-scoped via localStorage is sufficient)
- Topic-based search filtering UI (depends on taxonomy, can ship after Phase 3)

## Sources

- [ZeroEntropy - Ultimate Guide to Reranking Models 2026](https://www.zeroentropy.dev/articles/ultimate-guide-to-choosing-the-best-reranking-model-in-2025) -- reranking model landscape and benchmarks
- [ZeroEntropy - LLM as Reranker Pros/Cons](https://www.zeroentropy.dev/articles/llm-as-reranker-guide) -- Gemini Flash benchmarks at 0.68 NDCG@10
- [Google Vertex AI RAG Engine Reranking Docs](https://cloud.google.com/vertex-ai/generative-ai/docs/rag-engine/retrieval-and-ranking) -- Gemini reranking in Vertex
- [InsertRank: LLMs reason over BM25 scores](https://arxiv.org/html/2506.14086v1) -- 3-16% gains from injecting BM25 scores into reranking prompt
- [Voyage AI - Case Against LLMs as Rerankers](https://blog.voyageai.com/2025/10/22/the-case-against-llms-as-rerankers/) -- counterpoint: LLM score instability across runs
- [NLP for Local Governance Meeting Records](https://arxiv.org/html/2602.08162v1) -- academic survey of NLP for municipal meetings, topic clustering methods
- [Postmark - Transactional Email Best Practices 2026](https://postmarkapp.com/guides/transactional-email-best-practices) -- digest batching, branding, accessibility
- [SendPulse - Email Digest Design](https://sendpulse.com/blog/email-digest-design) -- layout patterns and content hierarchy
- [CivicPatterns.org](http://civicpatterns.org/) -- civic technology design patterns
- [Picovoice - Speaker Diarization vs Identification](https://picovoice.ai/blog/speaker-diarization-vs-speaker-recognition-identification/) -- fingerprinting vs diarization distinction
- [Gemini Cookbook - Search Reranking](https://github.com/google-gemini/cookbook/blob/main/examples/Search_reranking_using_embeddings.ipynb) -- Google's own reranking example with embeddings
- [Civic Tech Budget Explorers Directory](https://directory.civictech.guide/listing-category/budget-explorers) -- existing civic tech budget visualization projects
- Codebase analysis: `rag.server.ts` (9 tools, orchestrator prompt, synthesis), `profiling.ts` (stances, highlights, speaking time), `people.ts` (15-query profile loader), `send-alerts/index.ts` (digest + pre-meeting email HTML), `types.ts` (schema types including `financial_cost`, `voice_fingerprint_id`), `normalize_category_to_topic()` SQL function (8 broad topic categories from ~300 CivicWeb categories)
