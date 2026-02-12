import { data, type ActionFunctionArgs } from "react-router";
import { getSupabaseAdminClient } from "../lib/supabase.server";
import { clearVimeoCache } from "../services/vimeo.server";

export async function action({ request }: ActionFunctionArgs) {
  const supabaseAdmin = getSupabaseAdminClient();
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  const formData = await request.formData();
  const meetingId = formData.get("meetingId");

  if (!meetingId) {
    return data({ error: "Missing meetingId" }, { status: 400 });
  }

  try {
    // 1. Fetch current meta and video_url
    const { data: meeting, error: fetchError } = await supabaseAdmin
      .from("meetings")
      .select("meta, video_url")
      .eq("id", meetingId)
      .single();

    if (fetchError || !meeting) {
      return data({ error: "Meeting not found" }, { status: 404 });
    }

    // 2. Clear in-memory cache if video_url exists
    if (meeting.video_url) {
      clearVimeoCache(meeting.video_url);
    }

    const meta = (meeting.meta as any) || {};

    // 3. Clear vimeo cache keys in DB
    const newMeta = {
      ...meta,
      vimeo_direct_url: null,
      vimeo_direct_audio_url: null,
      vimeo_direct_url_updated_at: null,
      vimeo_cache_invalidated_at: new Date().toISOString(),
    };

    // 4. Update DB
    const { error: updateError } = await supabaseAdmin
      .from("meetings")
      .update({ meta: newMeta })
      .eq("id", meetingId);

    if (updateError) {
      throw updateError;
    }

    console.log(`[Video Failure] Invalidated cache for meeting ${meetingId}`);
    return data({ success: true });
  } catch (error) {
    console.error("[Video Failure] Error:", error);
    return data({ error: "Internal server error" }, { status: 500 });
  }
}
