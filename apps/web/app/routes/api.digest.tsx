import type { Route } from "./+types/api.digest";
import { getSupabaseAdminClient } from "../lib/supabase.server";
import { getMeetingDigest } from "../services/subscriptions";

/**
 * GET /api/digest?meeting_id=123
 *
 * Returns the meeting digest payload as JSON.
 * Returns null (204) if the meeting only has an agenda (no minutes/transcript).
 * This can be used by the edge function to build email content,
 * or by the frontend to preview what a digest would look like.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const meetingId = url.searchParams.get("meeting_id");

  if (!meetingId) {
    return new Response(JSON.stringify({ error: "meeting_id is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = getSupabaseAdminClient();
  const digest = await getMeetingDigest(supabase, Number(meetingId));

  if (!digest) {
    return new Response(null, { status: 204 });
  }

  return new Response(JSON.stringify(digest), {
    headers: { "Content-Type": "application/json" },
  });
}
