---
phase: 11-gap-closure-gemini-fix
verified: 2026-02-19T04:30:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 11: Gap Closure & Gemini Fix — Verification Report

**Phase Goal:** Close all audit-identified integration gaps, upgrade Gemini model to gemini-3-flash-preview across web and pipeline, and clean up dead code paths
**Verified:** 2026-02-19T04:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | RAG citations for document sections display section headings (not generic document titles) | VERIFIED | `rag.server.ts:1111` maps `heading: d.section_title` — field name matches the `hybrid_search_document_sections` RPC return column |
| 2   | All Gemini API calls across web app and pipeline use gemini-3-flash-preview model | VERIFIED | 4 occurrences in web app (rag.server.ts:1198, 1333; api.search.tsx:174; api.intel.tsx:115); 7 occurrences in 5 pipeline files; zero deprecated model names in any source file |
| 3   | Web app uses @google/genai SDK (not deprecated @google/generative-ai) | VERIFIED | package.json has `"@google/genai": "^1.42.0"` with no @google/generative-ai direct dep; all 3 app files import `GoogleGenAI` from `@google/genai` |
| 4   | No dead code querying non-existent database tables | VERIFIED | Research confirmed `councillor_highlights` table exists with data for 8 councillors — INT-02 was a false positive; scope correctly excluded from this phase |
| 5   | REQUIREMENTS.md checkboxes reflect actual completion status (all 15 checked) | VERIFIED | All 15 v1.1 requirement checkboxes show `[x]`; zero `[ ]` unchecked boxes |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `apps/web/app/services/rag.server.ts` | RAG agent with new SDK + heading fix | VERIFIED | `import { GoogleGenAI } from "@google/genai"`, lazy singleton with `new GoogleGenAI({ apiKey })`, `heading: d.section_title` at line 1111, `client.models.generateContent` calls at lines 1197-1203 and 1332-1341 |
| `apps/web/app/routes/api.search.tsx` | Search API with new SDK | VERIFIED | `import { GoogleGenAI } from "@google/genai"` at line 11; `new GoogleGenAI({ apiKey: geminiKey })` at line 170; `followupAI.models.generateContent({ model: "gemini-3-flash-preview", ... })` at lines 173-176 |
| `apps/web/app/routes/api.intel.tsx` | Intel API with new SDK | VERIFIED | `import { GoogleGenAI } from "@google/genai"` at line 2; `const ai = new GoogleGenAI({ apiKey })` at line 83; `ai.models.generateContent({ model: "gemini-3-flash-preview", config: { responseMimeType: "application/json" } })` at lines 114-118 |
| `apps/pipeline/pipeline/ingestion/ai_refiner.py` | AI refiner with updated model name | VERIFIED | `model="gemini-3-flash-preview"` at lines 500, 924, 985 — all three occurrences updated |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `apps/web/app/services/rag.server.ts` | `@google/genai` | `import { GoogleGenAI } from "@google/genai"` at line 1 | WIRED | Import present; `GoogleGenAI` class instantiated in lazy singleton at line 26 |
| `apps/web/app/services/rag.server.ts` | `hybrid_search_document_sections` RPC result | `heading: d.section_title` field mapping at line 1111 | WIRED | Field name matches actual RPC return column `section_title` — mismatch fully resolved |
| `apps/pipeline/pipeline/ingestion/gemini_extractor.py` | model constant | `GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")` at line 23 | WIRED | Default updated; `batch_extractor.py` imports this constant — no change needed there |
| `apps/pipeline/pipeline/profiling/stance_generator.py` | model constant | `GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")` at line 24 | WIRED | Default updated; `profile_agent.py` imports this constant — no change needed there |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| SRCH-04 | 11-01-PLAN.md | Search covers document sections, key statements, transcript segments, and motions | SATISFIED | The `d.heading -> d.section_title` fix restores section-level heading display in RAG citations; all four content types searchable via hybrid RPCs |

**Traceability cross-check:** SRCH-04 is the only requirement declared in 11-01-PLAN.md frontmatter. REQUIREMENTS.md Traceability table maps SRCH-04 to Phase 8 (original implementation) — Phase 11 is a gap-closure fix for a degraded aspect of SRCH-04, not a new requirement assignment. No orphaned requirements.

**Checkpoint — all 15 v1.1 requirements now [x]:** DOC-01 through DOC-05 (previously unchecked), SRCH-01 through SRCH-06 (SRCH-03 previously unchecked), PROF-02, PROF-04, PROF-05, PROF-06 — all now show `[x]`. Audit finding "6 unchecked boxes" is resolved.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| None | — | — | — | — |

No TODO/FIXME/placeholder patterns found in any modified file. The `return []` instances in `ai_refiner.py` (lines 892, 935) are legitimate early-return guards when no GEMINI_API_KEY is set — not stubs.

### Human Verification Required

#### 1. RAG citation heading rendering in live UI

**Test:** Issue a search question about a document that has known sections (e.g. a zoning bylaw). Observe AI answer citation cards.
**Expected:** Citation cards show specific section headings (e.g. "3.2 Permitted Uses") rather than the generic document title (e.g. "Zoning Bylaw").
**Why human:** The `d.section_title` fix is in place and the field mapping is correct, but verifying the end-to-end rendering requires a live environment with indexed document sections in the database.

#### 2. gemini-3-flash-preview API availability confirmation

**Test:** Trigger a search query that reaches the AI answer path with a real API key configured.
**Expected:** Answer streams successfully with no model-not-found error.
**Why human:** Cannot verify that the model identifier `gemini-3-flash-preview` is an accepted name in the Google Gemini API without making a live API call. The model name matches the plan's specification but requires runtime confirmation.

### Gaps Summary

No gaps found. All five observable truths verified against actual codebase contents.

**Gap closure confirmation:**
- **INT-01** (RAG heading mismatch): CLOSED — `heading: d.section_title` confirmed at `rag.server.ts:1111`
- **INT-02** (dead councillor_highlights code): RESCOPED — research confirmed the table exists; the code path is functional. Correctly excluded from this phase.
- **FLOW-01** (Document section RAG citations degraded): CLOSED — field mismatch that caused silent `undefined` heading is fixed

**Audit tech debt cleared:**
- Deprecated `@google/generative-ai` SDK: removed from direct dependencies
- `gemini-flash-latest` in api.search.tsx: replaced with `gemini-3-flash-preview`
- `gemini-2.0-flash` in process_bylaws.py and process_agenda.py: replaced
- `gemini-2.5-flash` defaults in gemini_extractor.py and stance_generator.py: replaced
- `gemini-flash-latest` in ai_refiner.py (3 occurrences): replaced
- 6 unchecked REQUIREMENTS.md checkboxes: all now `[x]`

---

_Verified: 2026-02-19T04:30:00Z_
_Verifier: Claude (gsd-verifier)_
