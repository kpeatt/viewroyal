# Requirements: ViewRoyal.ai — Land & Launch Milestone

**Defined:** 2026-02-16
**Core Value:** Citizens can understand what their council decided, why, and who said what — without attending meetings or reading hundreds of pages of PDFs.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Schema Stabilization

- [ ] **SCHEMA-01**: Embedding dimension mismatch fixed — query embeddings generate halfvec(384) matching stored embeddings
- [ ] **SCHEMA-02**: Missing `match_transcript_segments` RPC function restored — Ask page transcript search works
- [ ] **SCHEMA-03**: All 23 applied migrations validated against PR migration SQL — no duplicate/conflicting migrations on merge
- [ ] **SCHEMA-04**: PR #35 (embedding migration) merged to main without schema conflicts

### Key Statement Extraction

- [ ] **KS-01**: Key statement extraction prompts improved per PR #37 fixes
- [ ] **KS-02**: PR #37 merged to main after PR #35

### Multi-Tenancy

- [ ] **MT-01**: Municipality context loaded in root loader from `municipalities` table
- [ ] **MT-02**: All hardcoded "View Royal" strings replaced with dynamic municipality data (22+ files)
- [ ] **MT-03**: Service queries accept and filter by `municipality_id`
- [ ] **MT-04**: RAG system prompts dynamically reference municipality name
- [ ] **MT-05**: Vimeo proxy uses dynamic `websiteUrl` for Referer/Origin
- [ ] **MT-06**: PR #36 merged to main after PRs #35 and #37

### Subscriptions & Notifications

- [ ] **SUB-01**: User can subscribe to a specific matter and receive email when it has new activity
- [ ] **SUB-02**: User can subscribe to a specific councillor and receive email on their motions/votes
- [ ] **SUB-03**: User can subscribe to a topic/category and receive email on matching items
- [ ] **SUB-04**: User can subscribe to a neighbourhood and receive email on geographically relevant items
- [ ] **SUB-05**: User can subscribe to weekly meeting digest email
- [ ] **SUB-06**: User can manage subscription preferences (frequency, channels, unsubscribe) from settings page
- [ ] **SUB-07**: Email delivery works via Resend through Supabase Edge Function
- [ ] **SUB-08**: `user_profiles` table exists with address, neighbourhood, notification preferences
- [ ] **SUB-09**: `subscriptions` table supports polymorphic subscription types (matter, topic, person, neighbourhood, digest)
- [ ] **SUB-10**: `alert_log` table tracks sent alerts with deduplication
- [ ] **SUB-11**: Public user signup available (currently admin-only auth)
- [ ] **SUB-12**: PR #13 merged to main after PR #36, with necessary adaptations for multi-tenancy context

### Home Page Enhancements

- [ ] **HOME-01**: Active matters section shows 5-6 recently-active matters ordered by `last_seen` with title, category badge, duration, and 1-line summary
- [ ] **HOME-02**: Recent decisions feed shows last 10-15 non-procedural motions with plain English summary, result, vote breakdown, date, and link to meeting
- [ ] **HOME-03**: Upcoming meetings section shows next scheduled meetings with agenda topic preview
- [ ] **HOME-04**: Divided votes highlighted with visual indicator in decisions feed
- [ ] **HOME-05**: Financial cost displayed on decisions when `financial_cost` is available

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Document Viewer
- **DOC-01**: Document viewer component with official-document styling
- **DOC-02**: Agenda package view with inline/linked schedules per item
- **DOC-03**: Bidirectional links between document sections and agenda items

### Public API
- **API-01**: Authenticated JSON API with rate limiting
- **API-02**: OCD-compliant civic data endpoints
- **API-03**: Non-streaming RAG research endpoint

### RAG Enhancements
- **RAG-01**: Query understanding pipeline with entity resolution
- **RAG-02**: Hybrid search (semantic + full-text) with RRF
- **RAG-03**: Conversation memory with follow-up support

### Council Member Profiling
- **PROF-01**: AI-synthesized policy position summaries
- **PROF-02**: Legislative effectiveness stats
- **PROF-03**: Topic-scoped voting alignment

### Speaker ID Improvements
- **SPEAK-01**: Multi-sample voice fingerprints with auto-enrollment
- **SPEAK-02**: Custom vocabulary for Indigenous terms and municipal jargon
- **SPEAK-03**: Transcript quality scoring and correction pipeline

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Push notifications / native app | Overkill for current user base size |
| Social features (comments, reactions, forums) | Moderation nightmare; undermines official record credibility |
| Real-time live meeting notifications | Architecture mismatch (batch pipeline, not live) |
| SMS notifications | Cost/compliance overhead unjustified at current scale |
| Gamification / engagement scores | Patronizing for civic context |
| User-generated content / wiki editing | Undermines official record credibility |
| OAuth providers (Google, GitHub) | Inappropriate for civic audience; magic links are lower friction |
| Second town onboarding (Esquimalt, RDOS) | Deferred until multi-tenancy is solid on View Royal |
| Meeting summary cards (#4) | Not in this milestone |
| Enhanced Ask page (#5) | Not in this milestone |
| Topic clustering page (#6) | Not in this milestone |
| Enhanced person profiles (#7) | Deferred to council member profiling milestone |
| Neighbourhood filtering (#9) | DB column doesn't exist yet; subscription neighbourhood features are scoped separately |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHEMA-01 | — | Pending |
| SCHEMA-02 | — | Pending |
| SCHEMA-03 | — | Pending |
| SCHEMA-04 | — | Pending |
| KS-01 | — | Pending |
| KS-02 | — | Pending |
| MT-01 | — | Pending |
| MT-02 | — | Pending |
| MT-03 | — | Pending |
| MT-04 | — | Pending |
| MT-05 | — | Pending |
| MT-06 | — | Pending |
| SUB-01 | — | Pending |
| SUB-02 | — | Pending |
| SUB-03 | — | Pending |
| SUB-04 | — | Pending |
| SUB-05 | — | Pending |
| SUB-06 | — | Pending |
| SUB-07 | — | Pending |
| SUB-08 | — | Pending |
| SUB-09 | — | Pending |
| SUB-10 | — | Pending |
| SUB-11 | — | Pending |
| SUB-12 | — | Pending |
| HOME-01 | — | Pending |
| HOME-02 | — | Pending |
| HOME-03 | — | Pending |
| HOME-04 | — | Pending |
| HOME-05 | — | Pending |

**Coverage:**
- v1 requirements: 29 total
- Mapped to phases: 0
- Unmapped: 29 ⚠️

---
*Requirements defined: 2026-02-16*
*Last updated: 2026-02-16 after initial definition*
