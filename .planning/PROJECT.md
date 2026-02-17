# ViewRoyal.ai — Civic Intelligence Platform

## What This Is

A civic transparency platform that scrapes council meeting documents and video from municipal websites, diarizes speakers, extracts structured data with AI, and serves it through a searchable web app with subscription-based email alerts. Currently live for View Royal, BC with multi-town architecture built in. Citizens can browse meetings, motions, bylaws, people, and matters — ask natural language questions answered by a RAG agent — subscribe to topics, councillors, and matters for personalized email digests — and manage preferences through a guided onboarding flow.

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

### Active

## Current Milestone: v1.1 Deep Intelligence

**Goal:** Deepen the platform's intelligence layer — chunk and embed documents for granular search, upgrade RAG with hybrid search and conversation memory, and build comprehensive council member profiles.

**Target features:**
- PDF document sectioning with per-section embeddings (agendas, addendums, supplementary schedules)
- RAG enhancements: hybrid search, conversation memory, document sections as sources
- Council member profiling: AI stance summaries, voting pattern analysis, activity/engagement metrics

### Out of Scope

- Document viewer with official-document styling — future milestone candidate
- Public API with OCD-compliant endpoints — future milestone candidate
- Speaker ID improvements (multi-sample fingerprints, custom vocabulary) — future milestone candidate
- Second town onboarding (Esquimalt, RDOS) — deferred until v1.0 is stable in production
- Push notifications / native app — overkill for current user base size
- Social features (comments, reactions, forums) — undermines official record credibility
- Real-time live meeting notifications — architecture mismatch (batch pipeline)
- SMS notifications — cost/compliance overhead unjustified at current scale
- OAuth providers (Google, GitHub) — inappropriate for civic audience; magic links are lower friction

## Context

Shipped v1.0 with ~28K LOC TypeScript (web app), ~40+ database tables.
Tech stack: React Router 7, Cloudflare Workers, Supabase PostgreSQL + pgvector, Google Gemini, fastembed.
6 phases, 11 plans, 25 tasks completed in 1.65 hours of execution time.
4 long-running PRs (#35, #37, #36, #13) merged in strict dependency order.

**Known technical debt:**
- `bootstrap.sql` is out of date with 23+ applied migrations
- `searchKeyStatements` export in vectorSearch.ts is orphaned dead code
- `search_key_statements` tool label missing from TOOL_LABELS in ask.tsx (cosmetic)
- `login.tsx` labels page "Admin Access" — should be "Sign In" for public users
- `settings.tsx` hardcodes `VIEW_ROYAL_NEIGHBORHOODS` (intentional for single-town MVP)
- Email delivery requires one-time external Resend/SMTP configuration

## Constraints

- **Runtime**: Cloudflare Workers — no `process.env`, no Node.js APIs, env vars inlined at build time via Vite
- **AI**: Google Gemini for refinement + RAG; OpenAI text-embedding-3-small for web app embeddings; fastembed for pipeline embeddings
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
| halfvec(384) over vector(768) | 95% storage reduction, Matryoshka truncation preserves quality | ✓ Good — merged and working |
| Resend for transactional email | Free tier sufficient for initial scale, Edge Function compatible | ✓ Good — code complete, needs config |
| Mix multi-town + UX features in v1.0 | Land existing PRs while adding high-impact UX features | ✓ Good — all 29 requirements met |
| PR merge order #35→#37→#36→#13 | Strict dependency chain prevents runtime failures | ✓ Good — zero conflicts |
| tsvector FTS instead of RPC restoration | Simpler, faster, no custom RPC maintenance | ✓ Good |
| Cherry-pick PR #13 instead of merge | Preserves Phase 2 municipality context changes | ✓ Good |
| Hand-drawn SVG map instead of GeoJSON | Lighter, decorative, no build dependency | ✓ Good |
| Onboarding as 3-step wizard with React state | Smoother UX than URL params, easy to extend | ✓ Good |
| Phase 6 gap closure from audit | Systematic requirement verification before shipping | ✓ Good — all gaps closed |

---
*Last updated: 2026-02-16 after v1.1 milestone start*
