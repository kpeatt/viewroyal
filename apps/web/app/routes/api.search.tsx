import type { Route } from "./+types/api.search";
import { classifyIntent } from "../lib/intent";
import {
  hybridSearchAll,
  getSearchResultCache,
  saveSearchResultCache,
} from "../services/hybrid-search.server";
import { runQuestionAgent, type AgentEvent } from "../services/rag.server";
import { createSupabaseServerClient } from "../lib/supabase.server";
import { getMunicipality } from "../services/municipality";
import { GoogleGenAI } from "@google/genai";

// Simple in-memory rate limiter: max requests per IP within a window
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const ipRequestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();

  // Clean stale entries inline instead of via setInterval (which breaks CF Workers)
  for (const [key, timestamps] of ipRequestLog.entries()) {
    const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length === 0) {
      ipRequestLog.delete(key);
    } else {
      ipRequestLog.set(key, recent);
    }
  }

  const timestamps = ipRequestLog.get(ip) || [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  ipRequestLog.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX;
}

function getClientIP(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Unified search API route.
 *
 * GET /api/search?q=...             -> auto-detect intent (keyword or AI)
 * GET /api/search?q=...&mode=keyword -> force keyword search (JSON)
 * GET /api/search?q=...&mode=ai     -> force AI answer (streaming SSE)
 * GET /api/search?id=abc123         -> retrieve cached AI answer (JSON)
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const query = url.searchParams.get("q");
  const modeParam = url.searchParams.get("mode");
  const context = url.searchParams.get("context") || undefined;

  // 1. Cached result lookup by ID
  if (id) {
    const cached = await getSearchResultCache(id);
    if (!cached) {
      return Response.json(
        { error: "Result not found or expired" },
        { status: 404 },
      );
    }
    return Response.json({
      answer: cached.answer,
      sources: cached.sources,
      suggested_followups: cached.suggested_followups,
      query: cached.query,
      cached: true,
    });
  }

  // 2. Require query for search
  if (!query) {
    return Response.json(
      {
        usage: {
          GET: {
            params: {
              q: "search query (required unless id is provided)",
              mode: "keyword | ai (optional, auto-detected if omitted)",
              context: "previous Q&A context for follow-ups (optional)",
              id: "cached result ID for shareable URLs (optional)",
              type: "filter by content type, repeatable (optional)",
            },
          },
        },
        examples: [
          "GET /api/search?q=tree+bylaw&mode=keyword",
          "GET /api/search?q=What+did+council+decide+about+housing?",
          "GET /api/search?id=abc123",
        ],
      },
      { status: 200 },
    );
  }

  // 3. Determine mode
  let mode: "keyword" | "question";
  if (modeParam === "keyword") {
    mode = "keyword";
  } else if (modeParam === "ai" || modeParam === "question") {
    mode = "question";
  } else {
    mode = classifyIntent(query);
  }

  // 4. Keyword mode -> JSON response
  if (mode === "keyword") {
    const filterTypes = url.searchParams.getAll("type") as Array<
      "motion" | "key_statement" | "document_section" | "transcript_segment"
    >;

    const results = await hybridSearchAll(query, {
      types: filterTypes.length > 0 ? filterTypes : undefined,
      limit: 30,
    });

    return Response.json({ results, query, intent: "keyword" });
  }

  // 5. AI answer mode -> streaming SSE
  if (isRateLimited(getClientIP(request))) {
    return new Response("Too many requests. Please try again in a minute.", {
      status: 429,
    });
  }

  const { supabase } = createSupabaseServerClient(request);
  const municipality = await getMunicipality(supabase);

  // Collect streamed chunks for caching after completion
  let fullAnswer = "";
  let allSources: any[] = [];

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const enqueue = (data: AgentEvent | { type: string; id?: string }) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        for await (const event of runQuestionAgent(
          query,
          context,
          undefined,
          municipality.name,
        )) {
          // Collect answer chunks and sources for caching
          if (event.type === "final_answer_chunk") {
            fullAnswer += event.chunk;
          } else if (event.type === "sources") {
            allSources = event.sources;
          }

          // Stream all events except "done" (we add followups + cache_id before it)
          if (event.type === "done") {
            // Generate suggested follow-up questions using Gemini
            let followups: string[] = [];
            try {
              const geminiKey = process.env.GEMINI_API_KEY;
              if (geminiKey && fullAnswer.length > 50) {
                const followupAI = new GoogleGenAI({ apiKey: geminiKey });
                const followupPrompt = `Based on this civic question and answer about a municipal council, suggest 2-3 natural follow-up questions a citizen might ask. Return ONLY a JSON array of strings, nothing else.\n\nQuestion: ${query}\n\nAnswer summary: ${fullAnswer.slice(0, 500)}`;
                const followupResult =
                  await followupAI.models.generateContent({
                    model: "gemini-3-flash-preview",
                    contents: followupPrompt,
                  });
                const followupText = (followupResult.text ?? "").trim();
                const cleaned = followupText
                  .replace(/^```(?:json)?\s*\n?/i, "")
                  .replace(/\n?```\s*$/, "")
                  .trim();
                followups = JSON.parse(cleaned);
                if (!Array.isArray(followups)) followups = [];
                // Cap at 3 suggestions
                followups = followups.slice(0, 3);
              }
            } catch (e) {
              // Non-critical: fall back to no suggestions
              console.error("Failed to generate follow-ups:", e);
            }

            if (followups.length > 0) {
              enqueue({ type: "suggested_followups", followups });
            }

            // Cache the completed answer (with followups)
            const cacheId = await saveSearchResultCache({
              query,
              answer: fullAnswer,
              sources: allSources,
              suggested_followups: followups,
              source_count: allSources.length,
            });

            if (cacheId) {
              enqueue({ type: "cache_id", id: cacheId });
            }

            enqueue({ type: "done" });
          } else {
            enqueue(event);
          }
        }
      } catch (error: any) {
        console.error("Streaming search error:", error);
        const errorEvent: AgentEvent = {
          type: "final_answer_chunk",
          chunk: `\n\n**Error:** An unexpected error occurred. (${error.message})`,
        };
        enqueue(errorEvent);
        enqueue({ type: "done" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
