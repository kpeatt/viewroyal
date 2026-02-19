# Phase 11: Gap Closure & Gemini Fix - Research

**Researched:** 2026-02-18
**Domain:** Gemini API model migration, RAG citation bug fix, dead code removal
**Confidence:** HIGH

## Summary

This phase addresses three categories of work: (1) a confirmed field-name mismatch in `rag.server.ts` that causes document section citations to show generic document titles instead of section headings, (2) upgrading all Gemini API calls from deprecated model identifiers to `gemini-3-flash-preview`, and (3) cleaning up the audit's identified dead code paths.

The most significant discovery during research is that the web app's JavaScript Gemini SDK (`@google/generative-ai`) is **deprecated and past end-of-life** (November 30, 2025). It must be migrated to `@google/genai` to support `gemini-3-flash-preview`. This is not a simple model name swap -- the new SDK has a different API surface. Additionally, the audit's INT-02 finding ("dead councillor_highlights code") was **incorrect** -- the `councillor_highlights` table exists in the database with data for 8 councillors and has proper RLS policies. The code path is functional, not dead.

**Primary recommendation:** Fix the `d.heading` -> `d.section_title` mismatch (one-line fix), migrate the web app from `@google/generative-ai` to `@google/genai` (API changes required in 3 files), update all pipeline model names to `gemini-3-flash-preview`, and remove INT-02 from the gap closure scope (it's not a real issue).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SRCH-04 | Search covers document sections, key statements, transcript segments, and motions | The `d.heading` field mismatch in `rag.server.ts` line 1111 causes section headings to be `undefined` in RAG citations. Fixing this to `d.section_title` restores section-level citation quality for SRCH-04. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@google/genai` | latest | Gemini API for JS/TS (replaces deprecated `@google/generative-ai`) | Official Google SDK, required for Gemini 3 model support |
| `google-genai` | >=1.59.0 | Gemini API for Python | Already in use in pipeline, supports `gemini-3-flash-preview` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@google/genai` | Keep `@google/generative-ai` with `gemini-2.5-flash` | Avoids SDK migration but old SDK is past EOL, no support, and `gemini-2.0-flash` shuts down March 31, 2026 |

**Installation:**
```bash
cd apps/web && pnpm remove @google/generative-ai && pnpm add @google/genai
```

## Architecture Patterns

### Pattern 1: SDK Migration (Old -> New JS SDK)

**What:** The `@google/generative-ai` SDK uses a model-centric API (`genAI.getGenerativeModel().generateContent()`), while `@google/genai` uses a client-centric API (`ai.models.generateContent()`).

**Old pattern (3 files use this):**
```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
const result = await model.generateContent(prompt);
const text = result.response.text();

// Streaming
const stream = await model.generateContentStream(prompt);
for await (const chunk of stream.stream) {
  chunk.text();
}
```

**New pattern:**
```typescript
import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: API_KEY });
const result = await ai.models.generateContent({
  model: "gemini-3-flash-preview",
  contents: prompt,
});
const text = result.text;

// Streaming
const stream = await ai.models.generateContentStream({
  model: "gemini-3-flash-preview",
  contents: prompt,
});
for await (const chunk of stream) {
  chunk.text;
}
```

**Key differences:**
- Import: `GoogleGenerativeAI` -> `GoogleGenAI`
- Init: `new GoogleGenerativeAI(key)` -> `new GoogleGenAI({ apiKey: key })`
- No more `getGenerativeModel()` step -- model is passed per-call
- Response: `result.response.text()` -> `result.text`
- Streaming: `stream.stream` -> direct async iteration, `chunk.text()` -> `chunk.text`
- Source: [Google Migration Guide](https://ai.google.dev/gemini-api/docs/migrate)

### Pattern 2: Python Model Name Update

**What:** Python files use `google-genai` (the newer SDK) and reference model names either via env-var-backed constants or inline strings. All need updating from deprecated model names to `gemini-3-flash-preview`.

**Files and current model names:**

| File | Current Model | How Set |
|------|--------------|---------|
| `ai_refiner.py` (3 calls) | `"gemini-flash-latest"` | Hardcoded inline |
| `process_bylaws.py` | `"gemini-2.0-flash"` | `MODEL_NAME` constant |
| `process_agenda.py` | `"gemini-2.0-flash"` | `MODEL_NAME` constant |
| `gemini_extractor.py` | `"gemini-2.5-flash"` (env-backed) | `GEMINI_MODEL` from env |
| `stance_generator.py` | `"gemini-2.5-flash"` (env-backed) | `GEMINI_MODEL` from env |
| `profile_agent.py` | imports from `stance_generator` | Shared constant |

**Recommendation:** All env-var-backed defaults should change from `"gemini-2.5-flash"` to `"gemini-3-flash-preview"`. All hardcoded model names should change to `"gemini-3-flash-preview"`.

### Pattern 3: RAG Heading Fix

**What:** The `hybrid_search_document_sections` RPC returns `section_title` but `search_document_sections()` in `rag.server.ts` maps `d.heading` (undefined).

**Current code (line 1111):**
```typescript
heading: d.heading,          // undefined -- field doesn't exist in RPC result
```

**Fix:**
```typescript
heading: d.section_title,    // matches RPC return column name
```

**Downstream effect:** The `normalizeDocumentSectionSources()` function on line 1130 already falls back to `s.heading || s.document_title`, so with `heading` fixed, it will properly use the section title in citation display.

### Anti-Patterns to Avoid

- **Mixing old and new SDK imports:** Don't import both `@google/generative-ai` and `@google/genai` in the same file. Clean migration of each file.
- **Leaving hardcoded model names:** Use constants or env-var-backed defaults, not inline strings, for model names that may change again.
- **Assuming INT-02 is dead code:** The `councillor_highlights` table exists with data. Don't delete the `getCouncillorHighlights` function or the UI that renders highlights.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gemini SDK migration | Custom API wrapper | `@google/genai` official SDK | Google maintains compatibility, handles auth, provides TypeScript types |

## Common Pitfalls

### Pitfall 1: Streaming API Difference in New SDK

**What goes wrong:** The old SDK returns `{ stream }` from `generateContentStream`, requiring `stream.stream`. The new SDK returns the async iterable directly.
**Why it happens:** API surface changed fundamentally.
**How to avoid:** In `rag.server.ts`, the streaming call at line 1333 must change from:
```typescript
const stream = await model.generateContentStream([systemPrompt, userPrompt]);
for await (const chunk of stream.stream) {
  yield { type: "final_answer_chunk", chunk: chunk.text() };
}
```
to the new pattern where `generateContentStream` returns the iterable directly and `.text` is a property not a method.
**Warning signs:** Build succeeds but streaming answers produce no output, or runtime errors about `.stream` not being a function.

### Pitfall 2: Lazy-Initialized Singletons Need Updating

**What goes wrong:** `rag.server.ts` has lazy-init singletons for `genAI` (line 22-29) and `_supabase` (line 13-18). The `getGenAI()` function returns `GoogleGenerativeAI` but the new SDK needs `GoogleGenAI`.
**Why it happens:** Type changes in singleton pattern.
**How to avoid:** Update the type annotation and init code for the lazy singleton. Since the new SDK passes model per-call, the singleton only needs to hold the client, not a model reference.
**Warning signs:** TypeScript compile errors about incompatible types.

### Pitfall 3: `gemini-2.0-flash` Shutdown Deadline

**What goes wrong:** `gemini-2.0-flash` stops working on March 31, 2026. Any code using this model name will fail silently or throw errors.
**Why it happens:** Google retiring older models.
**How to avoid:** Complete this phase before March 31, 2026. All 5 occurrences of `gemini-2.0-flash` must be updated.
**Warning signs:** API calls returning 404 or model-not-found errors.

### Pitfall 4: `gemini-flash-latest` May Redirect

**What goes wrong:** The identifier `gemini-flash-latest` is non-standard. It may currently resolve to `gemini-2.0-flash` or may already be invalid. Four code locations use this identifier (3 in `ai_refiner.py`, 1 in `rag.server.ts`).
**Why it happens:** Using unofficial model aliases.
**How to avoid:** Replace all instances with the explicit `gemini-3-flash-preview` model name.
**Warning signs:** Silent failures in follow-up generation, degraded AI refiner output quality.

### Pitfall 5: ai_refiner.py Uses Python `google.genai` With Different API

**What goes wrong:** The `ai_refiner.py` file uses `client.models.generate_content(model=..., contents=..., config={...})` -- this is the newer Python SDK (`google-genai`), not the old one. Model name changes should work without API surface changes.
**Why it happens:** Python pipeline already uses the modern SDK.
**How to avoid:** Only change the model name string, don't change the API call pattern.

## Code Examples

### Example 1: Complete rag.server.ts Streaming Migration

```typescript
// Source: https://ai.google.dev/gemini-api/docs/migrate
// Old (current):
import { GoogleGenerativeAI } from "@google/generative-ai";
let genAI: GoogleGenerativeAI | null = null;
function getGenAI(): GoogleGenerativeAI | null {
  if (!GEMINI_API_KEY) return null;
  if (!genAI) { genAI = new GoogleGenerativeAI(GEMINI_API_KEY); }
  return genAI;
}
// In runQuestionAgent:
const model = client.getGenerativeModel({ model: "gemini-flash-latest" });
const result = await model.generateContent([systemPrompt, userPrompt]);
const responseText = result.response.text().trim();
// Streaming:
const stream = await model.generateContentStream([systemPrompt, userPrompt]);
for await (const chunk of stream.stream) {
  yield { type: "final_answer_chunk", chunk: chunk.text() };
}

// New:
import { GoogleGenAI } from "@google/genai";
let genAI: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  if (!GEMINI_API_KEY) return null;
  if (!genAI) { genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); }
  return genAI;
}
// In runQuestionAgent:
const result = await client.models.generateContent({
  model: "gemini-3-flash-preview",
  contents: [systemPrompt, userPrompt],
});
const responseText = result.text?.trim() ?? "";
// Streaming:
const stream = await client.models.generateContentStream({
  model: "gemini-3-flash-preview",
  contents: [systemPrompt, userPrompt],
});
for await (const chunk of stream) {
  yield { type: "final_answer_chunk", chunk: chunk.text ?? "" };
}
```

### Example 2: api.intel.tsx Migration

```typescript
// Source: https://ai.google.dev/gemini-api/docs/migrate
// Old:
import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  generationConfig: { responseMimeType: "application/json" },
});
const result = await model.generateContent(prompt);
const response = await result.response;
const intelData = JSON.parse(response.text());

// New:
import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey });
const result = await ai.models.generateContent({
  model: "gemini-3-flash-preview",
  contents: prompt,
  config: { responseMimeType: "application/json" },
});
const intelData = JSON.parse(result.text ?? "{}");
```

## Inventory of All Changes

### Web App Changes (apps/web/)

| File | Change | Complexity |
|------|--------|------------|
| `package.json` | Remove `@google/generative-ai`, add `@google/genai` | Trivial |
| `app/services/rag.server.ts:1` | Update import | Trivial |
| `app/services/rag.server.ts:22-29` | Update lazy singleton type + init | Low |
| `app/services/rag.server.ts:1111` | `d.heading` -> `d.section_title` | Trivial (one-line fix) |
| `app/services/rag.server.ts:1181` | Model name + API pattern | Medium |
| `app/services/rag.server.ts:1201-1205` | `generateContent` call pattern | Medium |
| `app/services/rag.server.ts:1333-1339` | `generateContentStream` pattern | Medium |
| `app/routes/api.search.tsx:11` | Update import | Trivial |
| `app/routes/api.search.tsx:170-177` | Follow-up generation SDK pattern | Medium |
| `app/routes/api.intel.tsx:2` | Update import | Trivial |
| `app/routes/api.intel.tsx:83-89` | Model init + generateContent pattern | Medium |

### Pipeline Changes (apps/pipeline/)

| File | Change | Complexity |
|------|--------|------------|
| `pipeline/ingestion/ai_refiner.py:500` | `"gemini-flash-latest"` -> `"gemini-3-flash-preview"` | Trivial |
| `pipeline/ingestion/ai_refiner.py:924` | `"gemini-flash-latest"` -> `"gemini-3-flash-preview"` | Trivial |
| `pipeline/ingestion/ai_refiner.py:985` | `"gemini-flash-latest"` -> `"gemini-3-flash-preview"` | Trivial |
| `pipeline/ingestion/process_bylaws.py:33` | `"gemini-2.0-flash"` -> `"gemini-3-flash-preview"` | Trivial |
| `pipeline/ingestion/process_agenda.py:36` | `"gemini-2.0-flash"` -> `"gemini-3-flash-preview"` | Trivial |
| `pipeline/ingestion/gemini_extractor.py:23` | Default `"gemini-2.5-flash"` -> `"gemini-3-flash-preview"` | Trivial |
| `pipeline/profiling/stance_generator.py:24` | Default `"gemini-2.5-flash"` -> `"gemini-3-flash-preview"` | Trivial |

### Documentation Changes

| File | Change | Complexity |
|------|--------|------------|
| `README.md` | Update "Gemini Flash" references | Trivial |

### NOT Needed (Audit Corrections)

| File | Why No Change |
|------|---------------|
| `app/services/profiling.ts:166-182` | `councillor_highlights` table EXISTS in DB with 8 rows and public RLS. This is NOT dead code. |
| `app/routes/person-profile.tsx:116` | Uses `getCouncillorHighlights` which works -- the `.catch()` guard is just defensive coding |
| `.planning/REQUIREMENTS.md` | All 15 checkboxes already checked `[x]` |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@google/generative-ai` SDK | `@google/genai` SDK | Deprecated Nov 30, 2025 | Must migrate -- old SDK no longer maintained |
| `gemini-2.0-flash` | `gemini-3-flash-preview` | 2.0 Flash deprecated, shuts down March 31, 2026 | All calls using 2.0 Flash will fail after March 31 |
| `gemini-flash-latest` | `gemini-3-flash-preview` | Non-standard alias, unreliable | May already be failing silently |
| `gemini-2.5-flash` | `gemini-3-flash-preview` | 3 Flash is latest generation | Better performance at similar pricing |

**Deprecated/outdated:**
- `@google/generative-ai` npm package: Past end-of-life (Nov 30, 2025), archived repo. Must use `@google/genai`.
- `gemini-2.0-flash`: Shutting down March 31, 2026.
- `gemini-flash-latest`: Non-standard identifier, unreliable resolution.

## Open Questions

1. **Does `@google/genai` work on Cloudflare Workers?**
   - What we know: The old SDK worked. The new SDK uses standard `fetch` internally.
   - What's unclear: Whether the new SDK has any Node.js-specific dependencies that break on Workers
   - Recommendation: Test immediately after migration by running `pnpm build` and deploying. If it fails, check the SDK's import path for Node-specific APIs. The SDK is designed for edge runtimes so it should work.
   - Confidence: MEDIUM (likely works but untested in this codebase)

2. **System instruction parameter support in new SDK**
   - What we know: `ai_refiner.py` uses `config={"system_instruction": ...}` which is a Python SDK feature
   - What's unclear: Whether the JS SDK `@google/genai` has an equivalent for `getGenerativeModel({ systemInstruction })` from the old SDK
   - Recommendation: For `rag.server.ts`, system prompts are currently passed as the first element of a content array `[systemPrompt, userPrompt]` -- this pattern should continue to work with the new SDK since it's just multi-part content
   - Confidence: HIGH

3. **Pricing impact of model upgrade**
   - What we know: `gemini-3-flash-preview` pricing is $0.50/1M input, $3.00/1M output. The previous `gemini-2.0-flash` was $0.10/1M input, $0.40/1M output.
   - What's unclear: Exact cost impact on the pipeline's batch processing
   - Recommendation: This is a ~5x price increase. Monitor costs after migration. Consider using `gemini-2.5-flash` ($0.15/$0.60) as a fallback if costs are too high.
   - Confidence: HIGH (pricing is documented)

## Sources

### Primary (HIGH confidence)
- [Google Migration Guide](https://ai.google.dev/gemini-api/docs/migrate) - JS SDK migration patterns
- [Gemini Models Page](https://ai.google.dev/gemini-api/docs/models) - Model names and deprecation status
- [Gemini 3 Developer Guide](https://ai.google.dev/gemini-api/docs/gemini-3) - Model name: `gemini-3-flash-preview`
- [Deprecated JS SDK Repo](https://github.com/google-gemini/deprecated-generative-ai-js) - Archived Dec 16, 2025, EOL Nov 30, 2025
- Codebase analysis - All Gemini call sites identified and inventoried
- Supabase DB verification - `councillor_highlights` table confirmed to exist with 8 rows and public RLS

### Secondary (MEDIUM confidence)
- [OpenRouter Model Page](https://openrouter.ai/google/gemini-3-flash-preview) - Gemini 3 Flash Preview model identifier confirmed
- [Google AI Developers Forum](https://discuss.ai.google.dev/t/confused-about-google-generative-ai-google-genai-and-all-hosted-repos/79022) - SDK confusion clarification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Model names and SDK migration well-documented by Google
- Architecture: HIGH - All affected files identified, API patterns documented with examples
- Pitfalls: HIGH - Streaming API differences, singleton patterns, and deadline pressures are concrete and verifiable

**Research date:** 2026-02-18
**Valid until:** 2026-03-31 (hard deadline: `gemini-2.0-flash` shutdown)
