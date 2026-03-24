# ViewRoyal.ai — Civic Intelligence Platform

## What This Is

A civic transparency platform that scrapes council meeting documents and video from municipal websites, diarizes speakers, extracts structured data with AI, and serves it through a searchable web app with subscription-based email alerts and a public REST API with developer documentation. Citizens can browse meetings, motions, bylaws, people, and matters — search across all content types with hybrid keyword+vector search — ask natural language questions answered by a RAG agent with conversation memory — view AI-generated councillor stance summaries backed by evidence — compare councillors side by side — and subscribe to topics for personalized email digests. Developers can integrate via authenticated REST and OCD-standard APIs with interactive documentation at docs.viewroyal.ai.

## Core Value

Citizens can understand what their council decided, why, and who said what — without attending meetings or reading hundreds of pages of PDFs.

## Requirements

### Validated

- ✓ Python ETL pipeline: scrape, download, diarize, AI refine, embed — v1.0
- ✓ CivicWeb scraper for View Royal — v1.0
- ✓ Legistar scraper (Esquimalt) with structured data fast path — v1.0
- ✓ Static HTML scraper (RDOS) — v1.0
- ✓ Pluggable scraper registry with BaseScraper interface — v1.0
- ✓ Video source abstraction (Vimeo, YouTube, inline, null) — v1.0
- ✓ Municipality-aware CLI (`--municipality`, `--all`) — v1.0
- ✓ `municipalities` table with source_config JSONB — v1.0
- ✓ `municipality_id` FK on organizations, meetings, matters, elections, bylaws — v1.0
- ✓ `documents` and `document_sections` tables for structured document storage — v1.0
- ✓ `key_statements` table for extracted quotable statements — v1.0
- ✓ Full document ingestion (all PDFs, no truncation, section hierarchy) — v1.0
- ✓ Attachment-to-agenda-item linking — v1.0
- ✓ OCD ID columns on core tables — v1.0
- ✓ `tsvector` full-text search on transcript_segments — v1.0
- ✓ SSR web app on Cloudflare Workers with React Router 7 — v1.0
- ✓ Meeting detail pages with agenda items, motions, transcript, video — v1.0
- ✓ RAG Q&A with Gemini (ask page, streaming answers with citations) — v1.0
- ✓ People profiles with voting history and speaking stats — v1.0
- ✓ Matters tracking with timeline — v1.0
- ✓ Bylaws and elections pages — v1.0
- ✓ Matters map with geographic display — v1.0
- ✓ MLX diarization with voice fingerprinting (Apple Silicon) — v1.0
- ✓ Embedding migration: halfvec(384), key statement embeddings, consolidated segments — v1.0
- ✓ Key statement extraction prompt improvements — v1.0
- ✓ Web app multi-tenancy: dynamic municipality context replacing hardcoded "View Royal" — v1.0
- ✓ User subscriptions (matter, councillor, topic, neighbourhood, digest) with email alerts — v1.0
- ✓ Public user signup with guided onboarding (topics, location, digest preference) — v1.0
- ✓ Home page with active matters, decisions feed, upcoming meeting preview, public notices — v1.0
- ✓ Divided vote visualization with controversial toggle — v1.0
- ✓ Personalized digest emails with subscription highlighting — v1.0
- ✓ Pre-meeting alert capability in Edge Function — v1.0
- ✓ Pipeline chunks PDF documents into sections with heading-based parsing — v1.1
- ✓ Document sections with halfvec(384) embeddings and tsvector FTS indexes — v1.1
- ✓ Document sections linked to agenda items via title matching — v1.1
- ✓ Existing documents backfilled into sections with embeddings — v1.1
- ✓ Unified search page replacing separate Search and Ask pages — v1.1
- ✓ Intent detection: keyword queries show results, questions trigger AI answers — v1.1
- ✓ Hybrid search RPCs with Reciprocal Rank Fusion across 4 content types — v1.1
- ✓ Follow-up questions with 5-turn conversation memory — v1.1
- ✓ Speaking time metrics from transcript segment durations — v1.1
- ✓ AI stance summaries per councillor per topic with confidence scoring — v1.1
- ✓ Side-by-side councillor comparison (voting, stances, activity) — v1.1
- ✓ Pipeline detects new documents and video for existing meetings — v1.2
- ✓ Pipeline selectively re-ingests only meetings with new content — v1.2
- ✓ Daily scheduled pipeline runs via launchd on Mac Mini — v1.2
- ✓ Moshi push notifications when new content is found and processed — v1.2
- ✓ Rotating log file and concurrency lock for safe unattended runs — v1.2
- ✓ API key authentication with SHA-256 hashing, timing-safe comparison, and per-key rate limiting — v1.3
- ✓ Consistent JSON error shape and CORS headers across all API routes — v1.3
- ✓ Municipality-scoped REST endpoints for meetings, people, matters, motions, bylaws — v1.3
- ✓ Cursor-based pagination with opaque base64 cursors and consistent response envelope — v1.3
- ✓ Cross-content keyword search API with type filtering and relevance scoring — v1.3
- ✓ Open Civic Data standard endpoints (jurisdictions, organizations, people, events, bills, votes) — v1.3
- ✓ OCD IDs (UUID v5 deterministic) and page-based pagination matching OpenStates convention — v1.3
- ✓ OpenAPI 3.1 spec at /api/v1/openapi.json with interactive Swagger UI at /api/v1/docs — v1.3
- ✓ Self-service API key management page (create, view prefix, revoke with confirmation) — v1.3
- ✓ pnpm workspace monorepo with apps/web, apps/docs, and apps/vimeo-proxy — v1.4
- ✓ Fumadocs v16 + Next.js 16 documentation portal with static export — v1.4
- ✓ Auto-generated API reference from OpenAPI spec with interactive playground — v1.4
- ✓ Multi-language code examples (curl, JavaScript, Python) on API reference pages — v1.4
- ✓ Getting Started guide: zero to first API call walkthrough — v1.4
- ✓ Authentication, Pagination, and Error Handling developer guides — v1.4
- ✓ Data Model page with Mermaid ER diagram — v1.4
- ✓ OCD Standard Reference with entity mapping guide — v1.4
- ✓ docs.viewroyal.ai live on Cloudflare Workers with Orama search — v1.4
- ✓ Document viewer with polished typography, responsive scrollable tables, and deduplicated titles — v1.5
- ✓ Meeting provenance badges (Agenda, Minutes, Video) with clickable source links and last-updated timestamps — v1.5
- ✓ Document links on agenda items (count chips + "View full document") and matter timeline (document chips) — v1.5
- ✓ Table of contents sidebar with IntersectionObserver scroll-spy for long documents — v1.5
- ✓ Cross-reference detection linking bylaw mentions to bylaw pages with inline badges — v1.5
- ✓ Bylaw search tool for RAG agent with match_bylaws RPC — v1.6
- ✓ Grouped citation badges with hover/tap source preview cards — v1.6
- ✓ Keyword search time/type filters with URL state persistence — v1.6
- ✓ Collapsible source panel and follow-up suggestions redesign — v1.6
- ✓ RAG trace logging with query, tools, latency, sources for every AI answer — v1.7
- ✓ User feedback (thumbs up/down) on AI answers with anonymous and authenticated support — v1.7
- ✓ LLM reranking of search results via Gemini Flash Lite with flatten-rerank-unflatten pattern — v1.7
- ✓ Consolidated RAG agent from 10 tools to 4 with parallel sub-queries — v1.7
- ✓ Topic taxonomy classification (SQL-first + Gemini fallback) for agenda items — v1.7
- ✓ Key vote detection algorithm (minority position, close votes, ally breaks) with composite scoring — v1.7
- ✓ AI-generated councillor narrative profiles synthesizing voting, speaking, and stance data — v1.7
- ✓ Council member profile page redesigned with 6-tab layout (Profile, Policy, Key Votes, Votes, Speaking, Attendance) — v1.7
- ✓ Meeting cards with topic chips, motion tallies, and summary text — v1.7
- ✓ Motion outcome badges (passed/defeated/tabled/withdrawn) replacing inline logic across 17 files — v1.7
- ✓ Meeting attendance info driven by municipality meta JSONB with per-meeting overrides — v1.7
- ✓ Email digest redesigned with summary-first layout, Ask AI CTA, and Coming Up footer — v1.7
- ✓ Pre-meeting email with full agenda, subscription highlights, and data-driven attendance info — v1.7

### Active

(No active milestone — run `/gsd:new-milestone` to define v1.8 or next priorities)

### Out of Scope
- RDOS / multi-municipality ingestion — deferred to v1.8
- Push notifications / native app — overkill for current user base size
- Social features (comments, reactions, forums) — undermines official record credibility
- Real-time live meeting notifications — architecture mismatch (batch pipeline)
- SMS notifications — cost/compliance overhead unjustified at current scale
- OAuth providers (Google, GitHub) — inappropriate for civic audience; magic links are lower friction

## Context

Shipped v1.7 with ~49,000 LOC (TypeScript + Python), 40+ database tables, developer docs portal at docs.viewroyal.ai.
Tech stack: React Router 7, Cloudflare Workers, Hono + chanfana (API), Supabase PostgreSQL + pgvector, Google Gemini (gemini-3-flash-preview + gemini-2.5-flash-lite-preview for reranking), fastembed, fumadocs v16 + Next.js 16 (docs).
v1.0: 6 phases, 11 plans. v1.1: 6 phases, 20 plans. v1.2: 3 phases, 5 plans. v1.3: 4 phases, 14 plans. v1.4: 6 phases, 10 plans. v1.5: 4 phases, 7 plans. v1.6: 3 phases, 7 plans. v1.7: 4 phases, 9 plans.

**Known technical debt:**
- `bootstrap.sql` is out of date with 30+ applied migrations
- Phase 7.1 Gemini Batch API extraction paused — backfill waiting on quota
- `document_chunker.py` and several web modules lack dedicated test coverage
- Email delivery requires one-time external Resend/SMTP configuration
- `matters/detail.ts` dead query in Promise.all (wasted DB round-trip)
- `slugs.ts` utility created but unused (slugs resolved via DB columns)
- API search is keyword-only; hybrid vector+keyword descoped
- Rate Limit binding pricing needs verification before production launch
- Gemini cost projection: reranking + classification + profiling add new API consumers

## Constraints

- **Runtime**: Cloudflare Workers — no `process.env`, no Node.js APIs, env vars inlined at build time via Vite
- **AI**: Google Gemini (gemini-3-flash-preview) for refinement + RAG + stances; fastembed for pipeline embeddings
- **Diarization**: MLX on Apple Silicon — pipeline runs locally, not in CI/CD
- **Auth**: Supabase Auth with public signup (needs dashboard toggle to enable)
- **Cost**: Gemini API calls per meeting; Legistar fast path skips AI for structured sources
- **Email**: Resend via Supabase Edge Function; needs API key and domain DNS configuration

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Monorepo with pnpm workspaces | Web app + pipeline + proxy share repo but deploy independently | ✓ Good |
| Supabase for DB + auth + storage | Managed Postgres with pgvector, auth, storage, edge functions | ✓ Good |
| Cloudflare Workers for web app | SSR at edge, KV/R2 available, single deployment | ✓ Good |
| Municipality context via DB, not config files | Enables runtime discovery of towns, no redeploy to add one | ✓ Good |
| halfvec(384) over vector(768) | 95% storage reduction, Matryoshka truncation preserves quality | ✓ Good |
| Resend for transactional email | Free tier sufficient for initial scale, Edge Function compatible | ✓ Good |
| PyMuPDF font-analysis for doc chunking | Body_size * 1.2 threshold for headings, no ML dependency | ✓ Good |
| Hybrid search with RRF over Elasticsearch | pgvector + tsvector covers hybrid search natively | ✓ Good |
| Gemini for stance generation | Same provider as refinement, lazy singleton pattern | ✓ Good |
| Category normalization as IMMUTABLE SQL fn | Covers ~300/470 categories to 8 topics, no RPC needed | ✓ Good |
| @google/genai SDK over @google/generative-ai | New official SDK, model-per-call pattern, async iterables | ✓ Good |
| Pre-deploy test gating | pytest + vitest must pass before wrangler deploy | ✓ Good |
| Phase 7.1 pause (Batch API) | DOC requirements satisfied by Phase 7; batch backfill deferred | ✓ Good |
| Reuse audit.py for update detection | Existing find_meetings_needing_reingest() covers document changes | ✓ Good |
| MOSHI_TOKEN as feature toggle | Missing token silently disables notifications, no CLI flag needed | ✓ Good |
| fcntl.flock for pipeline lock | Auto-releases on crash/kill, no stale pidfile cleanup needed | ✓ Good |
| launchd over cron | Native macOS, better logging integration, StartCalendarInterval | ✓ Good |
| Hono alongside React Router in same Worker | URL-prefix split at fetch level (/api/v1/* and /api/ocd/* to Hono, rest to RR7) | ✓ Good |
| chanfana for OpenAPI generation | Auto-generates spec from Zod schemas, serves Swagger UI, minimal boilerplate | ✓ Good |
| SHA-256 over bcrypt for API keys | Keys are high-entropy random strings; SHA-256 is fast and sufficient | ✓ Good |
| CF Workers Rate Limit binding | Durable rate limiting across isolate evictions, per-key scoping | ✓ Good |
| Cursor-based pagination (v1 API) | Opaque base64 cursors, stable ordering, no offset-skip performance issues | ✓ Good |
| Page-based pagination (OCD API) | Matches OpenStates convention for civic tech compatibility | ✓ Good |
| UUID v5 via Web Crypto for OCD IDs | No npm dependency, deterministic IDs from entity PKs, Cloudflare-compatible | ✓ Good |
| Plain Hono handlers for OCD (not chanfana) | OCD has its own spec; OpenAPI generation unnecessary for those endpoints | ✓ Good |
| Serializer allowlist pattern | Never spread ...row; explicitly construct output objects to prevent field leakage | ✓ Good |
| Fire-and-forget trace insert | No await on rag_traces insert to avoid blocking SSE stream delivery | ✓ Good |
| Dual-write PostHog + Supabase traces | Same traceId in both for gradual migration path | ✓ Good |
| normalizeMotionResult canonical utility | Single RESULT_MAP covering all 11 DB values + typos, replaces 17 inline implementations | ✓ Good |
| Consolidated RAG tools (10 -> 4) | Promise.all sub-queries in each tool reduce agent confusion and round-trips | ✓ Good |
| Gemini Flash Lite for reranking | Fast and cheap model sufficient for relevance scoring; graceful degradation on failure | ✓ Good |
| SQL-first topic classification | bulk_classify_topics_by_category RPC handles majority; Gemini only for unmapped categories | ✓ Good |
| Vote counts from votes table | Not from motions.yes_votes/no_votes columns due to data quality issues | ✓ Good |
| Composite key vote scoring | minority*3 + closeness*2 + ally_breaks*1 balances detection pattern importance | ✓ Good |
| 6-tab profile page layout | Profile tab as default shows AI narrative first; General/Administration topics filtered | ✓ Good |
| Municipality meta for attendance | JSONB meta field with per-meeting sparse overrides; zero-migration deployment | ✓ Good |
| Compact email list format | Cards take too much vertical space; compact list scans better on mobile | ✓ Good |
| Fumadocs v16 + Next.js 16 static export | No server runtime needed; static `out/` served by Workers Static Assets | ✓ Good |
| Cloudflare Workers Static Assets (not Pages) | Pages deprecated; `[assets]` directive in wrangler.toml is the modern approach | ✓ Good |
| generateFiles() for OpenAPI MDX | No RSC server available in static export; prebuild generates MDX at build time | ✓ Good |
| Prebuild script with committed fallback spec | Live API fetch at build time, checked-in openapi.json for offline builds | ✓ Good |
| pnpm workspace with shamefully-hoist | wrangler/vite plugins need hoisted deps; workspace keeps apps independent | ✓ Good |
| fumadocs baseUrl: '/' for root-level serving | Docs served at docs.viewroyal.ai root, not /docs/ subpath | ✓ Good |

---
*Last updated: 2026-03-24 after v1.7 View Royal Intelligence milestone completed*
