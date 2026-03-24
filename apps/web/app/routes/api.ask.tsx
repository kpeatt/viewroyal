import type { Route } from "./+types/api.ask";
import { runQuestionAgent, type AgentEvent } from "../services/rag.server";
import { createSupabaseServerClient, getSupabaseAdminClient } from "../lib/supabase.server";
import { getMunicipality } from "../services/municipality";
import { captureServerEvent } from "../lib/analytics.server";

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

// Helper to create the streaming response
function createStreamingResponse(question: string, context?: string, municipalityName?: string, clientIP?: string) {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const enqueue = (data: AgentEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const traceId = crypto.randomUUID();
      const streamStartTime = Date.now();
      let fullAnswer = "";
      let toolCallCount = 0;
      let sourceCount = 0;
      let inputTokens = 0;
      let outputTokens = 0;
      const toolCalls: { name: string; args: any }[] = [];
      let sourcesData: any[] = [];

      try {
        for await (const event of runQuestionAgent(question, context, undefined, municipalityName)) {
          if (event.type === "final_answer_chunk") {
            fullAnswer += event.chunk;
          } else if (event.type === "tool_call") {
            toolCallCount++;
            toolCalls.push({ name: event.name, args: event.args });
          } else if (event.type === "reranking") {
            // Attach reranking metadata to the most recent tool call for traces
            if (toolCalls.length > 0) {
              (toolCalls[toolCalls.length - 1] as any).reranking = {
                candidates: event.candidates,
                selected: event.selected,
                tool: event.tool,
              };
            }
          } else if (event.type === "sources") {
            sourceCount = (event.sources || []).length;
            sourcesData = event.sources || [];
          } else if (event.type === "usage_metadata") {
            inputTokens = event.inputTokens;
            outputTokens = event.outputTokens;
          }

          if (event.type === "done") {
            const latencyMs = Date.now() - streamStartTime;

            // Emit trace_id before done so the client captures it
            enqueue({ type: "trace_id", traceId });

            // PostHog dual-write (existing behavior)
            if (clientIP) {
              captureServerEvent("$ai_generation", clientIP, {
                $ai_trace_id: traceId,
                $ai_model: "gemini-3-flash-preview",
                $ai_provider: "google",
                $ai_input: question,
                $ai_output_choices: [fullAnswer],
                $ai_latency: latencyMs / 1000,
                $ai_http_status: 200,
                $ai_input_tokens: inputTokens,
                $ai_output_tokens: outputTokens,
                $ai_stream: true,
                source_count: sourceCount,
                tool_call_count: toolCallCount,
              }, waitUntil);
            }

            // Insert trace row to Supabase (fire-and-forget)
            getSupabaseAdminClient()
              .from("rag_traces")
              .insert({
                id: traceId,
                query: question,
                answer: fullAnswer,
                model: "gemini-3-flash-preview",
                latency_ms: latencyMs,
                tool_calls: toolCalls,
                source_count: sourceCount,
                sources: sourcesData,
                client_ip: clientIP || null,
                posthog_trace_id: traceId,
              })
              .then(({ error }) => {
                if (error) console.error("Failed to insert rag_trace:", error.message);
              });
          }

          enqueue(event);
        }
      } catch (error: any) {
        console.error("Streaming RAG error:", error);
        if (clientIP) {
          captureServerEvent("$ai_generation", clientIP, {
            $ai_trace_id: traceId,
            $ai_model: "gemini-3-flash-preview",
            $ai_provider: "google",
            $ai_input: question,
            $ai_http_status: 500,
            $ai_is_error: true,
            $ai_error: error.message,
          }, waitUntil);
        }
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

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (isRateLimited(getClientIP(request))) {
    return new Response("Too many requests. Please try again in a minute.", {
      status: 429,
    });
  }

  const { question, context } = (await request.json()) as { question?: string; context?: string };
  if (!question) {
    return new Response("Question is required", { status: 400 });
  }

  const { supabase } = createSupabaseServerClient(request);
  const municipality = await getMunicipality(supabase);
  return createStreamingResponse(question, context, municipality.name, getClientIP(request));
}

// Also support GET for simple queries
export async function loader({ request, context: loaderContext }: Route.LoaderArgs) {
  const waitUntil = loaderContext.cloudflare?.ctx?.waitUntil?.bind(loaderContext.cloudflare.ctx);
  const url = new URL(request.url);
  const question = url.searchParams.get("q");
  const context = url.searchParams.get("context") || undefined;

  if (!question) {
    return Response.json(
      {
        usage: {
          POST: {
            body: {
              question: "string",
              context: "string (optional, previous Q&A for follow-ups)",
            },
          },
          GET: {
            params: {
              q: "question",
              context: "previous question (optional)",
            },
          },
        },
        examples: [
          "GET /api/ask?q=What+issues+has+council+discussed+recently?",
          "GET /api/ask?q=What+are+Gery+Lemon's+priorities?",
          "POST /api/ask with { question: '...' }",
        ],
      },
      { status: 200 },
    );
  }

  if (isRateLimited(getClientIP(request))) {
    return new Response("Too many requests. Please try again in a minute.", {
      status: 429,
    });
  }

  const { supabase } = createSupabaseServerClient(request);
  const municipality = await getMunicipality(supabase);
  return createStreamingResponse(question, context, municipality.name, getClientIP(request));
}
