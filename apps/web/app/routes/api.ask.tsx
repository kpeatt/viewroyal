import type { Route } from "./+types/api.ask";
import { runQuestionAgent, type AgentEvent } from "../services/rag.server";

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
function createStreamingResponse(question: string, context?: string) {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const enqueue = (data: AgentEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        for await (const event of runQuestionAgent(question, context)) {
          enqueue(event);
        }
      } catch (error: any) {
        console.error("Streaming RAG error:", error);
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

  const { question, context } = await request.json();
  if (!question) {
    return new Response("Question is required", { status: 400 });
  }
  return createStreamingResponse(question, context);
}

// Also support GET for simple queries
export function loader({ request }: Route.LoaderArgs) {
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

  return createStreamingResponse(question, context);
}
