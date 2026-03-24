---
phase: 22-set-up-posthog-llm-analytics
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/app/services/rag.server.ts
  - apps/web/app/routes/api.ask.tsx
  - apps/web/app/routes/api.search.tsx
  - apps/web/app/routes/api.feedback.tsx
autonomous: true
requirements: [LLM-ANALYTICS]

must_haves:
  truths:
    - "PostHog LLM analytics dashboard shows token counts per generation"
    - "PostHog receives $ai_feedback events when users give thumbs up/down"
    - "PostHog receives $ai_generation events with error status on failures"
  artifacts:
    - path: "apps/web/app/routes/api.feedback.tsx"
      provides: "PostHog $ai_feedback event emission alongside Supabase write"
    - path: "apps/web/app/routes/api.ask.tsx"
      provides: "$ai_generation with token counts and error tracking"
    - path: "apps/web/app/routes/api.search.tsx"
      provides: "$ai_generation with token counts and error tracking"
  key_links:
    - from: "apps/web/app/routes/api.feedback.tsx"
      to: "PostHog"
      via: "captureServerEvent('$ai_feedback', ...)"
      pattern: "captureServerEvent.*ai_feedback"
    - from: "apps/web/app/services/rag.server.ts"
      to: "apps/web/app/routes/api.ask.tsx"
      via: "AgentEvent usage_metadata yield"
      pattern: "type.*usage_metadata"
---

<objective>
Complete PostHog LLM analytics integration by adding the missing event properties and event types.

Purpose: The project already sends `$ai_generation` events to PostHog but is missing token counts, feedback events, and error tracking -- the three things PostHog needs for its LLM analytics dashboard to be useful.

Output: Full PostHog LLM observability: token usage, user feedback, and error tracking all flowing into PostHog's AI analytics product.
</objective>

<execution_context>
@/Users/kyle/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kyle/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/app/lib/analytics.server.ts
@apps/web/app/services/rag.server.ts
@apps/web/app/routes/api.ask.tsx
@apps/web/app/routes/api.search.tsx
@apps/web/app/routes/api.feedback.tsx
@apps/web/app/components/search/ai-answer.tsx

<interfaces>
From apps/web/app/lib/analytics.server.ts:
```typescript
export function captureServerEvent(
  event: string,
  distinctId: string,
  properties?: Record<string, any>,
): void;
```

From apps/web/app/services/rag.server.ts:
```typescript
export type AgentEvent =
  | { type: "thought"; thought: string }
  | { type: "tool_call"; name: string; args: any }
  | { type: "tool_observation"; name: string; result: any }
  | { type: "reranking"; candidates: number; selected: number; tool: string }
  | { type: "final_answer_chunk"; chunk: string }
  | { type: "sources"; sources: any[] }
  | { type: "suggested_followups"; followups: string[] }
  | { type: "trace_id"; traceId: string }
  | { type: "done" };
```

PostHog expected $ai_generation properties:
- $ai_trace_id, $ai_model, $ai_provider (ALREADY SENT)
- $ai_input, $ai_output_choices, $ai_latency (ALREADY SENT)
- $ai_input_tokens, $ai_output_tokens (MISSING -- need to add)
- $ai_http_status (ALREADY SENT on success, MISSING on errors)
- $ai_stream: true (MISSING -- should add since we stream)

PostHog expected $ai_feedback properties:
- $ai_trace_id: string (link to generation)
- $ai_feedback_text: string (optional comment)
- $ai_is_positive: boolean (thumbs up/down)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add token counts to $ai_generation events and yield usage metadata from RAG agent</name>
  <files>apps/web/app/services/rag.server.ts, apps/web/app/routes/api.ask.tsx, apps/web/app/routes/api.search.tsx</files>
  <action>
1. In `rag.server.ts`, add a new AgentEvent variant:
   `| { type: "usage_metadata"; inputTokens: number; outputTokens: number }`

2. In `runQuestionAgent()` (the main generator function around line 1497), the Gemini `generateContentStream` call (line 1640) returns chunks. The LAST chunk from `@google/genai` streaming contains `usageMetadata` with `promptTokenCount` and `candidatesTokenCount`. After the for-await loop over the stream (lines 1647-1649), access the stream's `usageMetadata` property:
   ```
   // After the stream for-await loop completes:
   const usage = await stream.usageMetadata;
   if (usage) {
     yield { type: "usage_metadata", inputTokens: usage.promptTokenCount ?? 0, outputTokens: usage.candidatesTokenCount ?? 0 };
   }
   ```
   NOTE: The `@google/genai` SDK exposes `stream.usageMetadata` as a promise that resolves after streaming completes. If that doesn't work, accumulate from the last chunk's `.usageMetadata` property instead.

3. Also capture token usage from the non-streaming `generateContent` calls used in tool execution (around lines 1386 and 1518). These return `response.usageMetadata` directly. Accumulate tool-call token usage and yield a single `usage_metadata` event summing all calls.

4. In `api.ask.tsx`, inside the streaming handler (the `createStreamingResponse` function):
   - Add variables: `let inputTokens = 0; let outputTokens = 0;`
   - Handle the new event: `if (event.type === "usage_metadata") { inputTokens = event.inputTokens; outputTokens = event.outputTokens; }`
   - Add to the existing `captureServerEvent("$ai_generation", ...)` call:
     `$ai_input_tokens: inputTokens, $ai_output_tokens: outputTokens, $ai_stream: true`

5. In `api.search.tsx`, apply the same pattern: capture `usage_metadata` events and add `$ai_input_tokens`, `$ai_output_tokens`, `$ai_stream: true` to the existing `$ai_generation` event.

6. In both api.ask.tsx and api.search.tsx, add error-path `$ai_generation` events in the catch blocks:
   ```
   captureServerEvent("$ai_generation", clientIP, {
     $ai_trace_id: traceId,
     $ai_model: "gemini-3-flash-preview",
     $ai_provider: "google",
     $ai_input: question,
     $ai_http_status: 500,
     $ai_is_error: true,
     $ai_error: error.message,
   });
   ```
  </action>
  <verify>
    <automated>cd /Users/kyle/development/viewroyal/apps/web && pnpm typecheck</automated>
  </verify>
  <done>$ai_generation events include $ai_input_tokens, $ai_output_tokens, $ai_stream properties. Error paths emit $ai_generation with error status. TypeScript compiles cleanly.</done>
</task>

<task type="auto">
  <name>Task 2: Send $ai_feedback events to PostHog when users submit feedback</name>
  <files>apps/web/app/routes/api.feedback.tsx</files>
  <action>
1. Import `captureServerEvent` from `../lib/analytics.server`.

2. After the successful Supabase upsert (line 84, after the error check), add a PostHog `$ai_feedback` event:
   ```
   captureServerEvent("$ai_feedback", clientIP, {
     $ai_trace_id: traceId,
     $ai_is_positive: rating === 1,
     $ai_feedback_text: comment || undefined,
   });
   ```

This is fire-and-forget (same as the existing captureServerEvent pattern) so it won't slow down the response. The `$ai_trace_id` links the feedback to the original `$ai_generation` event in PostHog's LLM analytics UI.
  </action>
  <verify>
    <automated>cd /Users/kyle/development/viewroyal/apps/web && pnpm typecheck</automated>
  </verify>
  <done>PostHog receives $ai_feedback events with trace_id linkage when users submit thumbs up/down. Feedback appears in PostHog LLM analytics alongside the generation it refers to.</done>
</task>

</tasks>

<verification>
1. `pnpm typecheck` passes in apps/web
2. Manual verification: ask a question on the site, check PostHog live events for `$ai_generation` with `$ai_input_tokens` and `$ai_output_tokens` populated
3. Manual verification: click thumbs up/down, check PostHog live events for `$ai_feedback` with matching `$ai_trace_id`
</verification>

<success_criteria>
- PostHog `$ai_generation` events include `$ai_input_tokens`, `$ai_output_tokens`, `$ai_stream` properties
- PostHog `$ai_feedback` events fire on user feedback with `$ai_trace_id` linkage
- Error paths emit `$ai_generation` with `$ai_http_status: 500` and `$ai_is_error: true`
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/22-set-up-posthog-llm-analytics/22-01-SUMMARY.md`
</output>
