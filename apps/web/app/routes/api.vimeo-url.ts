import { getVimeoVideoData } from "../services/vimeo.server";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const videoUrl = url.searchParams.get("video_url");
  const meetingId = url.searchParams.get("meeting_id");

  if (!videoUrl) {
    return Response.json({ error: "video_url required" }, { status: 400 });
  }

  try {
    const result = await getVimeoVideoData(videoUrl, meetingId || undefined);
    return Response.json({
      direct_url: result?.direct_url || null,
      direct_audio_url: result?.direct_audio_url || null,
    });
  } catch {
    return Response.json({ direct_url: null, direct_audio_url: null });
  }
}
