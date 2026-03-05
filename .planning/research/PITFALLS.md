# Domain Pitfalls

**Domain:** Adding LLM reranking, conversation memory, topic taxonomy, speaker fingerprinting, AI profiling, and email redesign to an existing civic intelligence platform
**Researched:** 2026-03-05

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: LLM Reranking Latency Blowing Up Response Times

**What goes wrong:** Adding an LLM reranking pass between retrieval and synthesis doubles or triples RAG latency. The current agent loop already makes 2-6 Gemini calls (orchestrator steps) plus a final synthesis call. Adding a reranking call per tool invocation (or a single pass over aggregated results) pushes total latency past the point where users abandon the interaction. On Cloudflare Workers, the 30-second CPU time limit becomes a real constraint.

**Why it happens:** Reranking seems like a simple "add one more call" improvement, but the RAG pipeline is already streaming SSE events through multiple orchestrator turns. Each reranking call adds 1-3 seconds of Gemini latency. If you rerank per-tool (6 tools x 1-3s), you add 6-18 seconds. If you rerank once at the end, the user sees no streaming progress during the reranking pause.

**Consequences:** Users see a long "thinking" pause with no feedback. Cloudflare Workers may hit CPU limits. The perceived improvement in answer quality doesn't justify the latency hit for most queries.

**Prevention:**
- Rerank only once, after all tool results are collected, not per-tool-call. This is a single additional LLM call.
- Use the orchestrator model itself for reranking by injecting a "select the N most relevant sources" step before synthesis, rather than a separate reranking API call. Gemini already sees all the evidence.
- Set a strict latency budget: if reranking would push total time past 15 seconds, skip it and use RRF scores as-is.
- Consider reranking only when result count exceeds a threshold (e.g., >20 results) where RRF ordering might genuinely be suboptimal.

**Detection:** Monitor P95 RAG response times before and after. If P95 exceeds 12 seconds, reranking is too expensive.

**Phase:** RAG improvements phase. Build with a feature flag so it can be toggled off per-request.

---

### Pitfall 2: Conversation Memory in KV Creating Stale/Corrupt Context

**What goes wrong:** Moving conversation memory from the current client-side `context` string to Cloudflare KV introduces a new class of bugs: stale context, orphaned sessions, and context window overflow. The current approach sends the previous Q&A as a context string in the POST body (see `api.ask.tsx` line 114 and `rag.server.ts` line 1360-1364). It's simple and stateless. KV-backed memory adds state, and state rots.

**Why it happens:** The current system passes `context` as a simple string containing the previous question. It works because it's ephemeral and bounded. Moving to KV means:
- Sessions need TTLs, but what TTL? Too short (5 min) and users lose context mid-research. Too long (24h) and you're paying for storage and feeding irrelevant old context to the LLM.
- Context accumulation: 5 turns of Q&A context can easily exceed 8,000 tokens, consuming the LLM's attention budget and degrading answer quality for the current question.
- KV eventual consistency: a follow-up question might arrive before the previous answer's KV write propagates (Cloudflare KV is eventually consistent, not strongly consistent).

**Consequences:** Users get answers that reference conversations they didn't have (stale KV). Or the LLM ignores the current question because old context dominates. Or follow-ups fail silently because KV hasn't propagated yet.

**Prevention:**
- Keep the conversation window to 3-5 turns max. Summarize older turns into a single "previous context" paragraph rather than keeping full Q&A history.
- Use KV with `expirationTtl: 1800` (30 minutes) -- matches a realistic research session.
- Store a version counter and validate it on read. If the version doesn't match, start fresh.
- For the KV consistency issue: write with `{metadata: {turn: N}}` and on read, verify the turn count matches expectations. If not, fall back to the client-side context string.
- Consider: is KV actually needed? The current client-side approach works. The main gap is that full-page refreshes lose context. An alternative is `sessionStorage` on the client, which is synchronous and strongly consistent.

**Detection:** Log context token counts per RAG call. If context exceeds 4,000 tokens, the conversation window is too long.

**Phase:** RAG improvements phase. Evaluate whether KV is truly needed vs. client-side `sessionStorage`.

---

### Pitfall 3: The neighbourhood Column Ghost

**What goes wrong:** The `neighborhood` field exists in the TypeScript `AgendaItem` type (types.ts line 109) but does NOT exist as a column in the actual `agenda_items` database table. This is explicitly documented in CLAUDE.md and MEMORY.md. Building neighbourhood filtering against this ghost column will produce silent query failures -- Supabase `.select()` with a non-existent column returns no error, just omits the field.

**Why it happens:** The TypeScript types were written aspirationally, ahead of the schema. The `send-alerts` Edge Function already references `neighborhood` in its `DigestPayload` interface (line 51), and the subscription system supports `neighborhood` subscriptions (line 82). But the actual DB column was never added because the data source (CivicWeb PDFs) doesn't reliably provide neighbourhood information.

**Consequences:** If you build neighbourhood filtering UI that queries `agenda_items.neighborhood`, it will always return null/empty, and no items will match any neighbourhood filter. The feature will appear to work (no errors) but produce zero results.

**Prevention:**
- **Before any neighbourhood work**: Add the column to the database via a Supabase migration. Decide the column type (text vs. text[], since an item might span neighbourhoods).
- **Data population strategy**: Neighbourhood assignment must be solved in the pipeline, not the web app. Options: (a) geocode `related_address` and map to neighbourhood polygons (the `vrneighbourhoods.geojson` file already exists in `data/`), (b) have Gemini classify during ingestion based on addresses/descriptions, (c) both.
- **Backfill**: Existing ~700 meetings need neighbourhood assignment. This is a pipeline batch job, not a one-off script.
- **Test with real data** before building UI: Run the pipeline on a few meetings with known addresses and verify neighbourhood assignment accuracy.

**Detection:** Query `SELECT COUNT(*) FROM agenda_items WHERE neighborhood IS NOT NULL` -- if it returns 0 after the migration, the population strategy isn't working.

**Phase:** Pipeline improvements phase (must come before UX filtering phase). The DB migration and pipeline classification must ship before any frontend filtering.

---

### Pitfall 4: Speaker Fingerprinting Regression on Existing Diarization

**What goes wrong:** Adding speaker fingerprinting to the existing MLX diarization pipeline breaks previously-correct speaker assignments. The current clustering system (see `diarization/clustering.py`) uses agglomerative clustering with a cosine distance threshold of 0.7. Adding a fingerprint database that maps known speakers to embedding centroids can conflict with the unsupervised clustering, creating split speakers (one person assigned two labels) or merged speakers (two people merged because one's fingerprint is too close to the other's centroid).

**Why it happens:** The existing diarization pipeline works as a standalone unsupervised system. It clusters embeddings within a single meeting without knowing who anyone is. Speaker fingerprinting adds a supervised element: "this cluster matches Councillor X's stored embedding." The tension is:
- If you match against fingerprints first, then cluster unmatched segments, the threshold for "close enough to a fingerprint" interacts badly with the clustering threshold.
- Council members' voices change over time (colds, aging, microphone position) -- stored fingerprints drift.
- New speakers (public delegates, new staff) will get incorrectly matched to the closest councillor fingerprint if the threshold is too loose.

**Consequences:** Previously-correct diarizations get worse. Users who relied on accurate speaker attribution lose trust. Re-diarizing 700+ meetings with a buggy fingerprinting system creates a massive data quality regression.

**Prevention:**
- **Never re-diarize old meetings with new fingerprinting by default.** Apply fingerprinting only to new meetings. Provide a `--refingerprint` flag for intentional re-runs.
- **Two-phase approach:** First, run unsupervised clustering as-is. Then, match cluster centroids against the fingerprint DB with a strict threshold (cosine similarity > 0.85). Unmatched clusters stay as "Speaker 1", "Speaker 2".
- **Build a validation set:** Pick 10 meetings with known speaker assignments. Run fingerprinting. Compare results against ground truth before deploying.
- **Store fingerprints as rolling averages** of per-meeting centroids, not single snapshots. Update after each successful match. This handles voice drift.
- **Confidence scoring:** When a cluster matches a fingerprint, store the similarity score. UI can show "likely Councillor X (92% confident)" vs. "Speaker 3 (unidentified)".

**Detection:** Before/after comparison on the validation set. If speaker assignment accuracy drops by more than 5%, the fingerprinting threshold needs tuning.

**Phase:** Pipeline improvements phase. Must be implemented and validated before any web app changes that display fingerprinted speaker names.

---

### Pitfall 5: AI Profile Generation Without Freshness Strategy

**What goes wrong:** AI-generated councillor profiles (stance summaries, highlights, policy positions) become stale and misleading. The current stance generator (`profiling/stance_generator.py`) generates stances per-topic per-councillor. But there's no automatic regeneration when new evidence arrives. A councillor who changed position on housing six months ago still shows their old stance.

**Why it happens:** Profile generation is expensive (one Gemini call per councillor-topic pair, 7 councillors x 8 topics = 56 API calls). Running it after every pipeline ingestion is wasteful. But without automatic regeneration, profiles drift from reality. Worse, the current stances table has no `stale_after` or `evidence_cutoff_date` field, so there's no way to know if a stance was generated before or after a councillor's most recent relevant statement.

**Consequences:** A citizen reads "Councillor X supports the bike lane project" when Councillor X actually voted against it last month. This is worse than showing no stance at all -- it's actively misleading in a civic transparency context.

**Prevention:**
- **Add `evidence_cutoff_date` to councillor_stances table.** Set it to the most recent meeting date included in the evidence when generating.
- **Staleness check:** When displaying a stance, compare `evidence_cutoff_date` against the most recent meeting with relevant content. If there's newer evidence, show a "may be outdated" indicator.
- **Incremental regeneration:** After pipeline ingestion, check which councillors had new key_statements or votes. Only regenerate stances for those councillors on affected topics. This reduces the 56-call batch to 2-5 calls per pipeline run.
- **Date-bounded evidence gathering:** The current `_gather_evidence` function has no date filtering. Add optional `since_date` parameter to gather only new evidence, then merge with existing stance rather than regenerating from scratch.
- **Show generation date in UI:** The profile page should display "Analysis current as of [date]" so users can judge recency.

**Detection:** Query for stances where `evidence_cutoff_date < (SELECT MAX(meeting_date) FROM meetings WHERE has_transcript = true)`. These are stale.

**Phase:** Council member intelligence phase. Ship the DB migration and staleness check before building the new profile page design.

## Moderate Pitfalls

### Pitfall 6: Topic Taxonomy Mismatch Between Pipeline and Web App

**What goes wrong:** The current system uses two parallel topic systems: (a) the `normalize_category_to_topic` SQL function that maps ~300 CivicWeb categories to 8 topics (Administration, Bylaw, Development, Environment, Finance, General, Public Safety, Transportation), and (b) free-text `category` strings on agenda items. Adding a richer topic taxonomy (for clustering, filtering, or profile generation) creates a third system that doesn't align with either existing one.

**Why it happens:** The 8-topic normalization was designed for stance generation and is baked into an IMMUTABLE SQL function. It can't be extended without dropping and recreating it (and rerunning stances). The free-text categories come from CivicWeb and are inconsistent ("Public Hearing", "PUBLIC HEARING", "Public Hearings"). A new taxonomy needs to map to both.

**Prevention:**
- **Start from the existing 8 topics.** Extend them with subcategories rather than replacing. E.g., "Development > Rezoning", "Development > Subdivision". This preserves stance generation compatibility.
- **Create a `topic_taxonomy` table** with parent-child relationships. Map the existing 8 topics as top-level nodes. New subcategories are children.
- **Don't store computed topics as new columns.** Use the taxonomy table as a lookup. Agenda items reference taxonomy nodes via a junction table.
- **Migration path:** Update `normalize_category_to_topic` to return taxonomy node IDs instead of strings. This is breaking -- plan for a stance regeneration run.

**Phase:** Council member intelligence phase. Must precede profile redesign since profiles display topic-based data.

---

### Pitfall 7: Meeting Summary Cards Duplicating Existing Summaries

**What goes wrong:** Building "meeting summary cards" for the meeting list page creates duplication with the existing `meeting.summary` field. If the cards use a new AI-generated summary, it may contradict the existing summary. If they use the existing summary, the feature is just a UI reskin.

**Why it happens:** The existing `summary` field on meetings is populated by the AI refiner during pipeline ingestion. It's a single paragraph. "Meeting summary cards" implies a richer, structured summary (key decisions, attendance, controversy flag). These are different things, but both get called "summary."

**Prevention:**
- **Define clearly what the card shows** before building it. Proposed: structured card with (1) meeting type badge, (2) 2-3 key decisions as bullet points from motions, (3) attendance count, (4) controversy indicator if any agenda item is_controversial. This is assembled from existing data, not a new AI summary.
- **Don't generate new summaries.** Use existing motions, attendance, and is_controversial flags. This avoids Gemini costs and summary drift.
- **Keep the existing `summary` field** for the meeting detail page header. The card is a different view of the same data.

**Phase:** UX features phase.

---

### Pitfall 8: Email Template Redesign Breaking Resend Delivery

**What goes wrong:** Resend email delivery is sensitive to HTML structure. Complex email templates with nested CSS, web fonts, or modern CSS features (flexbox, grid) render incorrectly or trigger spam filters. The current Edge Function (`send-alerts/index.ts`) builds email HTML inline. A redesign that introduces a template library or complex markup can break delivery.

**Why it happens:** Email HTML is not web HTML. Email clients strip `<style>` tags, ignore CSS classes, and have wildly different rendering engines. Developers build beautiful templates in a browser preview, then they look broken in Gmail/Outlook. Worse, image-heavy or complex HTML emails get lower spam scores.

**Prevention:**
- **Use inline styles only.** No `<style>` blocks, no CSS classes. Every element gets its styles directly.
- **Test with Resend's preview** and real email clients (Gmail web, Apple Mail, Outlook) before deploying.
- **Keep the structure simple:** Single-column, table-based layout. No web fonts -- use system font stack.
- **Don't add images** unless absolutely necessary (they increase email size and can trigger spam filters). Use styled HTML elements for visual hierarchy instead.
- **Maintain the existing `send-alerts` Edge Function structure.** The current inline HTML approach is correct for email. Don't switch to a React email library that adds build complexity to a Deno Edge Function.

**Phase:** Email alerts phase. Ship as a separate deploy from the web app.

---

### Pitfall 9: LLM Reranking Inconsistency Across Identical Queries

**What goes wrong:** LLM-based reranking produces different orderings for the same query on different runs because LLM outputs are non-deterministic. This confuses users who re-ask the same question and get different source orderings, or worse, different answers because the synthesis model sees sources in a different order.

**Why it happens:** Gemini (and all LLMs) have inherent output variance even with temperature=0. The reranking prompt asks "rank these by relevance" and the model may assign different rankings each time. Combined with the current RRF scoring (which is deterministic), the reranked results look inconsistent.

**Prevention:**
- **Use reranking as a filter, not a reorderer.** Ask the LLM to identify the top-N most relevant results from the candidate set, but preserve RRF ordering within those top-N. This reduces variance to binary (included/excluded) rather than continuous (rank position).
- **Cache reranking results** for identical query+result combinations. If the same query hits the same RRF results, return the cached reranking.
- **Set temperature to 0** for the reranking call (Gemini supports this). Won't eliminate variance entirely but reduces it.

**Phase:** RAG improvements phase.

---

### Pitfall 10: Observability Data Explosion

**What goes wrong:** Adding RAG observability (logging every tool call, reranking decision, source selection) creates a firehose of data that's expensive to store and hard to query. The current system logs minimally (PostHog `$ai_generation` events with basic metrics). Adding per-step tracing with full context blows up storage costs.

**Why it happens:** Observability is a "more is better" instinct. Every tool call result, every reranking decision, every source selection feels important to log. But at 10+ events per RAG query, with full tool results (which can be 10KB+ each), storage grows fast.

**Prevention:**
- **Log structured summaries, not full results.** For each tool call, log: tool name, argument hash, result count, latency. NOT the full result payload.
- **Sample full traces.** Log complete traces for 10% of queries. For the other 90%, log only the summary metrics.
- **Use PostHog's existing `$ai_generation` event** as the primary observability point. Add properties for reranking_applied, sources_before_rerank, sources_after_rerank, total_tool_calls. Don't create a new event type per tool call.
- **Thumbs up/down feedback** is the highest-signal metric. Build that first, worry about detailed tracing later.

**Phase:** RAG improvements phase. Ship feedback buttons before detailed tracing.

## Minor Pitfalls

### Pitfall 11: Profile Page Redesign Losing Existing Functionality

**What goes wrong:** Redesigning the councillor profile page to add "at-a-glance cards" and policy positions risks removing or hiding existing features (voting history, speaking time charts, stance summaries) that users already use.

**Prevention:**
- **Inventory existing profile features** before designing the new layout: speaking time stats, speaking time by meeting chart, speaking time by topic, stance summaries with evidence, voting history link, key highlights, membership info.
- **Add new cards above or alongside existing sections,** don't replace them. The profile page should grow, not transform.
- **Progressive disclosure:** New AI-generated at-a-glance summary at the top, detailed existing sections below.

**Phase:** Council member profile redesign phase.

---

### Pitfall 12: Upcoming Meeting Info in Emails Without Data Source

**What goes wrong:** The email redesign includes "upcoming meeting attendance info" and "link to join in-progress meetings." But the pipeline scrapes CivicWeb, which only publishes agendas 3-7 days before meetings. "In-progress meeting" links require knowing the meeting is happening right now, which the batch pipeline can't provide.

**Prevention:**
- **Scope email improvements to post-meeting digests** and pre-meeting alerts (which already exist). Don't promise real-time "join now" links.
- **Pre-meeting alerts already work** (`mode: "pre_meeting"` in send-alerts). Enhance the template, don't add new real-time capabilities.
- **For upcoming meeting info:** Use the existing scraped agenda data. The pre-meeting alert can include "Agenda posted: [link]" and "Meeting date: [date]". That's sufficient.

**Phase:** Email alerts phase.

---

### Pitfall 13: Overloading the Gemini API Budget

**What goes wrong:** v1.7 adds multiple new Gemini consumers: reranking (per-query), profile generation (per-councillor-topic), topic classification (per-agenda-item), and stance regeneration (per-change). Without budget tracking, Gemini costs spike unpredictably.

**Prevention:**
- **Track per-feature Gemini usage** separately. Add a `feature` label to cost logging (reranking, stance, profile, classification).
- **Set per-feature daily caps.** Reranking: max 500 calls/day. Stance regeneration: max 100 calls/day. Profile generation: max 50 calls/day.
- **Use `gemini-3-flash-preview` for all new features** (already the default). Don't accidentally use a more expensive model.
- **Batch where possible.** Topic classification for all agenda items in a meeting can be a single prompt with JSON array output, not one call per item.

**Phase:** All phases. Establish cost monitoring in the first phase.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| RAG reranking | Latency budget exceeded (#1, #9) | Feature flag, latency monitoring, rerank-as-filter not reorderer |
| Conversation memory KV | Stale context, eventual consistency (#2) | Evaluate sessionStorage alternative, 30-min TTL, version counter |
| Topic taxonomy | Three-system fragmentation (#6) | Extend existing 8-topic system, not replace |
| Speaker fingerprinting | Diarization regression (#4) | Never auto-re-diarize old meetings, validation set of 10 meetings |
| AI profile generation | Stale profiles (#5) | evidence_cutoff_date column, incremental regeneration |
| Meeting summary cards | Duplication with existing summaries (#7) | Assemble from existing motions/attendance data, no new AI generation |
| Email redesign | Broken rendering, scope creep (#8, #12) | Inline styles only, test in real clients, no real-time features |
| Neighbourhood filtering | Ghost column (#3) | DB migration + pipeline geocoding must ship before frontend work |
| Observability | Data explosion (#10) | Log summaries not payloads, sample full traces at 10% |
| Profile redesign | Feature regression (#11) | Additive design, inventory existing features first |
| Cross-cutting | Gemini cost spike (#13) | Per-feature cost tracking, daily caps, batch API calls |

## Sources

- Direct code inspection: `rag.server.ts`, `api.ask.tsx`, `stance_generator.py`, `clustering.py`, `send-alerts/index.ts`, `types.ts`, `profiling.ts`, `embeddings.server.ts`
- Project documentation: `CLAUDE.md`, `PROJECT.md`
- Known issue from CLAUDE.md and MEMORY.md: neighbourhood column does not exist in database
- Existing geojson data: `data/vrneighbourhoods.geojson` (available for geocoding)
- Architecture constraints: Cloudflare Workers (CPU limits, no process.env), KV eventual consistency, Supabase Edge Functions (Deno runtime)
