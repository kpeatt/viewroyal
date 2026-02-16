# Codebase Concerns

**Analysis Date:** 2026-02-16

## Tech Debt

**Hardcoded Development IP Addresses:**
- Issue: Two Python configuration files contain hardcoded local IP addresses for development Ollama instances
- Files: `apps/pipeline/pipeline/config.py` (line 31), `apps/pipeline/pipeline/ingestion/ai_refiner.py` (line 17)
- Impact: Will fail silently in production environments without explicit environment variable overrides; not suitable for cloud deployments or CI/CD
- Fix approach: Make IP addresses fully environment-based with sensible fallbacks for non-local deployments; consider using service discovery patterns

**Bare Exception Handling:**
- Issue: Bare `except:` clause catches all exceptions including KeyboardInterrupt and SystemExit
- Files: `apps/pipeline/pipeline/ingestion/ingester.py` (line 30 in `to_seconds()` function)
- Impact: Makes debugging difficult; masks serious errors; prevents graceful shutdown
- Fix approach: Replace with specific exception types (ValueError, TypeError)

**Hardcoded Canonical Names Fallback:**
- Issue: Pipeline relies on hardcoded list of canonical names for View Royal as fallback when DB lookup fails
- Files: `apps/pipeline/pipeline/ingestion/ingester.py` (lines 53-91)
- Impact: Names become stale; requires code changes to update canonical names; doesn't scale to multiple municipalities
- Fix approach: Load from configuration file or external source; implement proper caching strategy

## Known Issues

**Pre-existing Type Error in voice-fingerprints.tsx (line 404):**
- Status: Documented in CLAUDE.md as pre-existing; ignore it
- Location: Code is actually in `apps/web/app/routes/speaker-alias.tsx` line 403
- Impact: None (code functions correctly despite type checker warning)
- Workaround: Ignore in type checking

**Wrangler Deploy Variable Overwrites:**
- Issue: `wrangler deploy` overwrites dashboard-set environment variables with values in `wrangler.toml` [vars] section
- Impact: Secrets set via Cloudflare dashboard get reset on each deployment
- Mitigation: All public vars must be hardcoded in `wrangler.toml` [vars] section
- File: `apps/web/wrangler.toml`

**Separator Component Sourcemap Warning:**
- Issue: Build generates harmless sourcemap warning from separator.tsx
- Impact: None (warning only, component functions correctly)
- Workaround: Can be safely ignored during build

## Security Considerations

**Publishable Supabase Key in Wrangler Config:**
- Risk: Supabase publishable key is committed to `wrangler.toml` (line 17)
- Files: `apps/web/wrangler.toml`
- Current mitigation: Key is publishable (not secret) and has RLS policies on Supabase tables
- Recommendations: Verify RLS policies are correctly enforced on all public tables; audit Row Level Security policies regularly

**Missing Row Level Security Policies:**
- Risk: Database schema (`sql/bootstrap.sql`) does not define RLS policies
- Impact: Admin client in web app bypasses all access control; potential for unauthorized data access if security model changes
- Current mitigation: Admin client is only used by authenticated endpoints; public tables are read-only
- Recommendations: Implement explicit RLS policies for all tables; reduce reliance on admin client in loaders

**Admin Client Usage in Public Routes:**
- Risk: `getSupabaseAdminClient()` is used throughout web app services to bypass RLS
- Files: `apps/web/app/routes/speaker-alias.tsx`, `apps/web/app/services/meetings.ts`, `apps/web/app/routes/api.bylaws.$id.download.tsx`
- Current mitigation: Used only in authenticated endpoints; data returned is not sensitive
- Recommendations: Review which endpoints truly need admin access; implement proper RLS instead of admin bypass

**Rate Limiting Implementation Fragility:**
- Risk: In-memory rate limiter in `api.ask.tsx` will not work in distributed Cloudflare Workers environment
- Files: `apps/web/app/routes/api.ask.tsx` (lines 4-27)
- Current mitigation: Limits are applied per-worker instance (not global)
- Recommendations: Implement rate limiting via Durable Objects or Cloudflare KV store for cross-worker coordination

## Performance Bottlenecks

**Large Component File Complexity:**
- Problem: Several React components exceed 1000 lines
- Files: `apps/web/app/routes/speaker-alias.tsx` (1,838 lines), `apps/web/app/components/meeting/VideoWithSidebar.tsx` (1,182 lines), `apps/web/app/routes/person-profile.tsx` (873 lines)
- Cause: Multiple concerns (data fetching, form handling, rendering) combined in single files
- Improvement path: Extract hooks, split into sub-components, use composition patterns

**Pagination Implementation Pattern:**
- Problem: Manual pagination via 1000-item chunks in transcript loading
- Files: `apps/web/app/services/meetings.ts` (lines 145-150)
- Cause: Supabase RLS client has 1000-row limit
- Impact: Meetings with >1000 transcript segments load slowly; multiple sequential requests
- Improvement path: Implement cursor-based pagination; consider server-side filtering

**Transcript Segment Loading:**
- Problem: All transcript segments for a meeting are fetched into memory regardless of usage
- Files: `apps/web/app/services/meetings.ts` (getMeetingById)
- Impact: Large meetings (2000+ segments) have high memory footprint and slow initial load
- Improvement path: Implement lazy loading; load segments on-demand as video plays

**AI Embedding Operations:**
- Problem: Embedding generation runs synchronously in pipeline; no batching or queueing
- Files: `apps/pipeline/pipeline/ingestion/embed.py`
- Impact: Long-running embeddings can timeout; blocking for other operations
- Improvement path: Implement async task queue; batch embeddings; add retry logic

## Fragile Areas

**Diarization Pipeline State Management:**
- Files: `apps/pipeline/pipeline/local_diarizer.py`, `apps/pipeline/pipeline/diarization/pipeline.py`
- Why fragile: Complex state transitions between clustering, fingerprinting, and segment alignment; multiple external model dependencies (MLX, embeddings)
- Safe modification: Add comprehensive logging; implement state validation between phases; test with edge cases (single speaker, silent segments)
- Test coverage: Limited to core parser tests; diarization quality not validated

**Meeting Item Alignment:**
- Files: `apps/pipeline/pipeline/alignment.py`
- Why fragile: Heuristic-based matching of agenda items to transcript segments; brittle to variations in meeting structure/format
- Issue: Agenda title must appear in transcript with high textual similarity; fails silently if formats change
- Safe modification: Add more flexible matching (fuzzy matching, semantic similarity); log mismatches
- Test coverage: No unit tests; alignment quality depends on manual verification

**Database Type vs Schema Mismatch Risk:**
- Files: `apps/web/app/lib/types.ts` contains `neighborhood?: string` field on line 90
- Current state: Field EXISTS in database (`sql/bootstrap.sql` line 210) — not a problem currently
- Risk: Documentation in CLAUDE.md incorrectly states neighborhood "does NOT exist" — could cause future developer confusion
- Recommendation: Update CLAUDE.md to note neighborhood column does exist and is queryable

**Matter Matching Logic:**
- Files: `apps/pipeline/pipeline/ingestion/matter_matching.py`
- Why fragile: Fuzzy string matching to link agenda items to matters; relies on clean identifiers
- Impact: Bylaw number format changes break matching; duplicate matters created on identifier variations
- Safe modification: Add validation of identifier format; implement deduplication; log match confidence scores

**Vimeo Integration Points:**
- Files: `apps/pipeline/pipeline/video/vimeo.py`, `apps/web/app/services/vimeo.server.ts`
- Why fragile: External API dependency; video availability can change; direct URL extraction via Puppeteer fragile to UI changes
- Current issue: Two different implementations (Python and TypeScript) for Vimeo URL extraction with different fallback strategies
- Safe modification: Implement timeout handling; add retry logic; monitor Vimeo API changes; consider webhook-based updates

## Scaling Limits

**In-Memory Rate Limiting:**
- Current capacity: Single Cloudflare Worker instance can track up to ~1000 unique IPs
- Limit: Breaks at scale (multiple workers) or high-traffic scenarios
- Scaling path: Migrate to Cloudflare KV store or Durable Objects for global rate limiting

**Supabase Connection Pooling:**
- Current capacity: Pipeline creates new client per operation
- Limit: Supabase free tier has connection limits (20 concurrent)
- Scaling path: Implement connection pooling; batch operations; use transaction blocks

**Transcript Segment Pagination:**
- Current capacity: 1000 segments per query; app handles manual pagination
- Limit: Breaks silently for >10,000 segments in a single meeting
- Scaling path: Implement cursor-based pagination; server-side filtering; consider archival for old meetings

**Embedding Generation:**
- Current capacity: Sequential processing; ~2-3 seconds per meeting
- Limit: Pipeline runtime grows linearly with number of meetings
- Scaling path: Implement parallel embedding batches; queue system; background workers

## Dependencies at Risk

**Google Gemini API:**
- Risk: Sole provider for AI refinement, key statement extraction, question answering
- Impact: API changes, rate limiting, or service disruption breaks RAG Q&A and ingestion refinement
- Migration plan: Prepare fallback to OpenAI API (partial implementation exists); implement graceful degradation

**MLX Diarization (Apple Silicon Only):**
- Risk: Hard dependency on Apple MLX framework for local diarization
- Impact: Pipeline cannot run on Linux/Windows; limits deployment options
- Migration plan: Implement fallback to Pyannote (open-source diarization); add device detection

**Vimeo for Council Meeting Video:**
- Risk: Single source for video hosting and direct URL extraction
- Impact: If Vimeo changes URL format or API, video playback breaks
- Migration plan: Implement caching of direct URLs; add fallback to embedded player; monitor Vimeo API changes

**Supabase pgvector Extension:**
- Risk: Semantic search depends on pgvector; if Supabase removes or breaks it, search fails
- Impact: RAG context window cannot be populated; Q&A becomes non-functional
- Migration plan: Keep vector data in external service (Pinecone/Weaviate); implement fallback to full-text search

## Test Coverage Gaps

**Web App Test Coverage:**
- What's not tested: React Router loaders/actions, Supabase integrations, RAG pipeline, video player state management
- Files: Only 12 test files across entire web app; most routes have zero tests
- Risk: Refactoring breaks navigation; data fetching errors caught only in production
- Priority: High — implement integration tests for critical user flows

**Pipeline E2E Testing:**
- What's not tested: End-to-end meeting ingestion (all 5 phases); interaction between diarization and ingestion
- Files: `apps/pipeline/tests/` contains 397 lines total; mostly unit-level parsing tests
- Risk: Phase interactions fail silently; full pipeline rarely tested locally
- Priority: High — implement integration test that runs full pipeline on sample meetings

**Diarization Quality Validation:**
- What's not tested: Speaker count accuracy, segment boundary alignment, fingerprint matching success rates
- Risk: Pipeline can produce broken diarization without detection; errors surface only when users review transcripts
- Priority: High — implement automated validation metrics (speaker count consistency, segment duration checks)

**Database Query Testing:**
- What's not tested: Supabase queries with real data; edge cases (missing fields, null relationships)
- Risk: Queries work with sample data but fail with production data variations
- Priority: Medium — add integration tests against test database with realistic data

**Video Player Edge Cases:**
- What's not tested: Scrubbing with large timestamps, speaker changes during playback, transcript synchronization
- Files: `apps/web/app/components/meeting/VideoWithSidebar.tsx`, `apps/web/app/hooks/useVideoPlayer.ts`
- Risk: UI state becomes inconsistent with video time; users report playback issues
- Priority: Medium — add snapshot and interaction tests

---

*Concerns audit: 2026-02-16*
