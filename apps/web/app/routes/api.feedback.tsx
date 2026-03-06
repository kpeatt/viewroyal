import { getSupabaseAdminClient } from "../lib/supabase.server";

// Simple rate limiter (same pattern as api.ask.tsx)
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20; // Generous limit for feedback
const ipRequestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
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

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const clientIP = getClientIP(request);

  if (isRateLimited(clientIP)) {
    return Response.json(
      { error: "Too many requests. Please try again in a minute." },
      { status: 429 },
    );
  }

  let body: { traceId?: string; rating?: number; comment?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { traceId, rating, comment } = body;

  // Validate
  if (!traceId || typeof traceId !== "string") {
    return Response.json({ error: "traceId is required" }, { status: 400 });
  }
  if (rating !== -1 && rating !== 1) {
    return Response.json(
      { error: "rating must be -1 or 1" },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseAdminClient();

    // Upsert using anonymous (IP-based) conflict resolution
    // The partial unique index on (trace_id, client_ip) WHERE user_id IS NULL handles dedup
    const { error } = await supabase.from("rag_feedback").upsert(
      {
        trace_id: traceId,
        rating,
        comment: comment || null,
        client_ip: clientIP,
        user_id: null,
      },
      {
        onConflict: "trace_id,client_ip",
        ignoreDuplicates: false,
      },
    );

    if (error) {
      console.error("Failed to upsert rag_feedback:", error.message);
      return Response.json(
        { error: "Failed to save feedback" },
        { status: 500 },
      );
    }

    return Response.json({ ok: true });
  } catch (error: any) {
    console.error("Feedback endpoint error:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
