import { getVimeoVideoData } from "../services/vimeo.server";
import { createSupabaseServerClient } from "../lib/supabase.server";
import { getMunicipality } from "../services/municipality";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const videoUrl = url.searchParams.get("video_url");
  const meetingId = url.searchParams.get("meeting_id");

  if (!videoUrl) {
    return Response.json({ error: "video_url required" }, { status: 400 });
  }

  try {
    const { supabase } = createSupabaseServerClient(request);
    const municipality = await getMunicipality(supabase);
    const result = await getVimeoVideoData(videoUrl, meetingId || undefined, municipality.website_url);
    return Response.json({
      direct_url: result?.direct_url || null,
      direct_audio_url: result?.direct_audio_url || null,
    });
  } catch {
    return Response.json({ direct_url: null, direct_audio_url: null });
  }
}
