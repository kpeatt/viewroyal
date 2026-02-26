# Milestones

## v1.0 Land & Launch (Shipped: 2026-02-17)

**Phases completed:** 6 phases, 11 plans, 25 tasks
**Timeline:** 1 day (2026-02-16 → 2026-02-16), 1.65 hours execution
**Git range:** a90269e9..19e1aaf8 (65 commits, 102 files changed, +13,270/-833 lines)
**Web app source:** ~28K LOC TypeScript

**Key accomplishments:**
1. Merged 4 long-running PRs (#35, #37, #36, #13) in strict dependency order — schema, key statements, multi-tenancy, subscriptions
2. Full multi-tenancy: dynamic municipality context from DB through root loader, all routes, RAG prompts, and Vimeo proxy
3. Complete subscription system: matter/councillor/topic/neighbourhood subscriptions, email digest with personalized highlighting, onboarding wizard
4. Home page redesign: 5-section layout with active matters, decisions feed with vote visualization, upcoming meeting preview, public notices
5. Advanced subscriptions: topic/keyword semantic matching, neighbourhood geocoding, pre-meeting alert capability
6. All 29 requirements satisfied, 8 audit gaps closed in Phase 6

**Delivered:** Citizens can browse meetings, subscribe to topics/matters/councillors, manage preferences through onboarding, receive personalized email digests, and ask AI questions — all with dynamic municipality context.

---


## v1.1 Deep Intelligence (Shipped: 2026-02-19)

**Phases completed:** 6 phases (5 complete + 1 paused), 20/21 plans complete
**Timeline:** 3 days (2026-02-17 → 2026-02-19), 2.77 hours execution
**Commits:** 98 commits since v1.0
**Codebase:** ~80,700 LOC (TypeScript + Python)

**Key accomplishments:**
1. PDF documents chunked into searchable sections with per-section halfvec(384) embeddings and tsvector indexes
2. Unified search page with intent detection — keyword queries show results list, questions trigger AI answers with citations
3. Hybrid search RPCs using Reciprocal Rank Fusion across document sections, key statements, motions, and transcripts
4. AI councillor stance summaries with confidence scoring and links to source evidence (motions, statements, transcripts)
5. Side-by-side councillor comparison page with voting alignment, activity metrics, and stance diffs
6. Comprehensive test suite (357 tests) with pre-deploy hooks gating deployments on test passes
7. Gemini SDK migrated to @google/genai with gemini-3-flash-preview across web app and pipeline

**Known gaps (tech debt):**
- Phase 7.1 paused at 2/3 plans — Gemini Batch API extraction backfill waiting on quota
- `councillor_highlights` dead code path removed but highlights feature not yet built
- `document_chunker.py` and several web modules lack dedicated test coverage

**Delivered:** Citizens can search across all content types with a single input, get AI answers with conversation memory, view AI-generated councillor stance summaries backed by evidence, and compare councillors side by side — all backed by granular document sections with embeddings.

---


## v1.2 Pipeline Automation (Shipped: 2026-02-20)

**Phases completed:** 3 phases, 5 plans, 9 tasks
**Timeline:** 1 day (2026-02-20), 12 minutes execution
**Source files:** 18 files changed, +1,811/-121 lines

**Key accomplishments:**
1. UpdateDetector module detecting new documents (disk vs DB comparison) and new video (Vimeo vs local archive) for existing meetings
2. --check-updates dry-run and --update-mode selective re-processing CLI flags wired into the pipeline
3. Moshi push notifications when update-mode detects and processes new content, with meeting name + content type summaries
4. fcntl.flock-based concurrency lock preventing overlapping pipeline runs, with automatic OS-level release on crash
5. Rotating log file (5MB x 5 backups) with TeeStream stdout capture for unattended debugging
6. launchd plist scheduling daily 6 AM pipeline runs via shell wrapper that sources .env and invokes uv

**Delivered:** Pipeline runs daily without manual intervention, automatically detecting new documents and video for existing meetings on CivicWeb/Vimeo, selectively re-ingesting only what changed, and sending push notifications to the operator's phone when new content is found.

---


## v1.3 Platform APIs (Shipped: 2026-02-22)

**Phases completed:** 4 phases, 14 plans, 26 tasks
**Timeline:** 2 days (2026-02-20 → 2026-02-22), ~50 minutes execution
**Git range:** e00304a1..d723ca3b (95 files changed, +13,025/-101 lines)
**API source:** 5,042 LOC TypeScript in `apps/web/app/api/`

**Key accomplishments:**
1. API key authentication with SHA-256 hashing, timing-safe comparison, and per-key Cloudflare Workers rate limiting
2. 10 REST data endpoints for meetings, people, matters, motions, and bylaws with cursor-based pagination and consistent response envelope
3. Cross-content keyword search across 5 content types with relevance scoring and type filtering
4. 12 Open Civic Data standard endpoints with UUID v5 OCD IDs, page-based pagination, and full entity mapping
5. Interactive OpenAPI 3.1 documentation with Swagger UI at `/api/v1/docs` and security scheme integration
6. Self-service API key management page with one-time key reveal, copy-to-clipboard, and confirmation-guarded revocation

**Known gaps (tech debt):**
- `matters/detail.ts` dead query in Promise.all (wasted DB round-trip, no functional impact)
- `slugs.ts` utility created but unused at runtime (slugs resolved via DB columns)
- Search is keyword-only; hybrid vector+keyword descoped (needs embedding credentials)
- Per-endpoint error responses not enumerated in OpenAPI spec (reusable error schema exists)
- `api_keys.name` column always "Default" (users can't name keys)

**Delivered:** API consumers can authenticate with API keys, browse all civic data through paginated REST endpoints, access Open Civic Data standard endpoints for interoperability, explore the API through interactive Swagger UI documentation, and manage their own API keys through a self-service web page.

---


## v1.4 Developer Documentation Portal (Shipped: 2026-02-25)

**Phases completed:** 6 phases, 10 plans
**Timeline:** 2 days (2026-02-23 → 2026-02-24), ~46 minutes execution
**Git range:** 621a2457..3999225e (91 files changed, +19,347/-83 lines)
**Docs site:** apps/docs/ — fumadocs v16 + Next.js 16, static export on Cloudflare Workers

**Key accomplishments:**
1. pnpm workspace monorepo with apps/web, apps/docs, and apps/vimeo-proxy as workspace members
2. Fumadocs v16 + Next.js 16 documentation portal with static export build pipeline and Orama search
3. Auto-generated API reference from OpenAPI spec with interactive playground and multi-language code samples (curl, JS, Python)
4. Hand-written developer guides: Getting Started, Authentication, Pagination, and Error Handling
5. Reference content: Data Model with Mermaid ER diagram, OCD Standard Reference, Changelog, and Contributing guide
6. Deployed to docs.viewroyal.ai on Cloudflare Workers Static Assets with custom domain routing

**Delivered:** Developers can browse complete API reference documentation with interactive playground, follow guides from zero to first API call in under 5 minutes, understand the data model through ER diagrams, and explore OCD standard mapping — all at docs.viewroyal.ai with full-text search.

---

