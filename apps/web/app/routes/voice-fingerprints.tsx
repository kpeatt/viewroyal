import { useState, useEffect, useRef } from "react";
import { Form, useSubmit, Link, useRevalidator } from "react-router";
import { requireAuth } from "../lib/auth.server";
import {
  getSupabaseAdminClient,
  createSupabaseServerClient,
} from "../lib/supabase.server";
import {
  Play,
  Pause,
  Volume2,
  User,
  Users,
  Fingerprint,
  Check,
  X,
  RefreshCw,
  ChevronRight,
  Mic,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { ScrollArea } from "../components/ui/scroll-area";
import { cn } from "../lib/utils";
import { getVimeoVideoData } from "../services/vimeo.server";

// Types
type Meeting = {
  id: number;
  title: string;
  meeting_date: string;
  video_url: string | null;
  direct_video_url?: string | null;
  direct_audio_url?: string | null;
};

type Person = {
  id: number;
  name: string;
  image_url: string | null;
  is_councillor: boolean;
  voice_fingerprint_id: string | null;
};

type VoiceFingerprint = {
  id: string;
  person_id: number;
  embedding: number[];
  confidence: number;
  person?: Person;
};

type DetectedSpeaker = {
  speaker_id: string;
  segment_count: number;
  total_duration: number;
  first_segment_time: number;
  centroid: number[] | null;
  matches: Array<{
    person_id: number;
    person_name: string;
    similarity: number;
    fingerprint_id: string;
  }>;
};

// Cosine similarity calculation
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function loader({ request }: { request: Request }) {
  await requireAuth(request);
  const url = new URL(request.url);
  const meetingId = url.searchParams.get("meetingId");

  // 1. Fetch all meetings with videos
  const { supabase: serverClient } = createSupabaseServerClient(request);
  const { data: meetings } = await serverClient
    .from("meetings")
    .select("id, title, meeting_date, video_url")
    .not("video_url", "is", null)
    .neq("video_url", "")
    .order("meeting_date", { ascending: false });

  // 2. Fetch all people with their fingerprints
  const { data: people } = await serverClient
    .from("people")
    .select("id, name, image_url, is_councillor, voice_fingerprint_id")
    .order("name");

  // 3. Fetch all existing voice fingerprints
  const { data: fingerprints } = await serverClient
    .from("voice_fingerprints")
    .select("id, person_id, embedding, confidence");

  let currentMeeting: Meeting | null = null;
  let detectedSpeakers: DetectedSpeaker[] = [];
  let transcriptSample: any[] = [];

  if (meetingId) {
    currentMeeting =
      meetings?.find((m) => m.id.toString() === meetingId) || null;

    if (currentMeeting) {
      // Get video URLs
      if (currentMeeting.video_url) {
        const vData = await getVimeoVideoData(
          currentMeeting.video_url,
          currentMeeting.id,
        );
        if (vData) {
          currentMeeting.direct_video_url = vData.direct_url;
          currentMeeting.direct_audio_url = vData.direct_audio_url;
        }
      }

      // Fetch transcript segments to get speaker info
      const { data: segments } = await supabase
        .from("transcript_segments")
        .select("id, speaker_name, start_time, end_time, text_content")
        .eq("meeting_id", meetingId)
        .order("start_time");

      transcriptSample = segments || [];

      // Group segments by speaker
      const speakerGroups: Record<string, any[]> = {};
      for (const seg of segments || []) {
        const speaker = seg.speaker_name || "Unknown";
        if (!speakerGroups[speaker]) speakerGroups[speaker] = [];
        speakerGroups[speaker].push(seg);
      }

      // Try to load centroids from the meeting's transcript JSON file
      // This would be stored in meeting meta or a separate table
      // For now, we'll check if there's centroid data in meeting meta
      const { data: meetingMeta } = await serverClient
        .from("meetings")
        .select("meta")
        .eq("id", meetingId)
        .single();

      const centroids = (meetingMeta?.meta as any)?.speaker_centroids || {};

      // Helper to normalize speaker ID and find matching centroid
      // Handles variations like "Speaker_1" vs "SPEAKER_01" vs "SPEAKER_1"
      const findCentroid = (speakerId: string): number[] | null => {
        // Direct match
        if (centroids[speakerId]) return centroids[speakerId];

        // Extract number from speaker ID
        const numMatch = speakerId.match(/(\d+)/);
        if (!numMatch) return null;
        const num = parseInt(numMatch[1], 10);

        // Try different formats
        const formats = [
          `SPEAKER_${num.toString().padStart(2, "0")}`, // SPEAKER_01
          `SPEAKER_${num}`, // SPEAKER_1
          `Speaker_${num}`, // Speaker_1
          `speaker_${num}`, // speaker_1
        ];

        for (const fmt of formats) {
          if (centroids[fmt]) return centroids[fmt];
        }

        return null;
      };

      // Build detected speakers list
      for (const [speakerId, segs] of Object.entries(speakerGroups)) {
        const totalDuration = (segs as any[]).reduce(
          (sum, s) => sum + (s.end_time - s.start_time),
          0,
        );

        const centroid = findCentroid(speakerId);

        // Find matches against known fingerprints
        const matches: DetectedSpeaker["matches"] = [];
        if (centroid && fingerprints) {
          for (const fp of fingerprints) {
            if (fp.embedding && Array.isArray(fp.embedding)) {
              const similarity = cosineSimilarity(centroid, fp.embedding);
              if (similarity > 0.6) {
                const person = people?.find((p) => p.id === fp.person_id);
                if (person) {
                  matches.push({
                    person_id: fp.person_id,
                    person_name: person.name,
                    similarity,
                    fingerprint_id: fp.id,
                  });
                }
              }
            }
          }
          // Sort by similarity
          matches.sort((a, b) => b.similarity - a.similarity);
        }

        detectedSpeakers.push({
          speaker_id: speakerId,
          segment_count: (segs as any[]).length,
          total_duration: totalDuration,
          first_segment_time: (segs as any[])[0]?.start_time || 0,
          centroid,
          matches,
        });
      }

      // Sort by total duration (most speaking time first)
      detectedSpeakers.sort((a, b) => b.total_duration - a.total_duration);

      // Also add speakers from centroids that aren't in transcript_segments
      // (in case segments use different naming than centroids)
      const existingSpeakerNums = new Set(
        detectedSpeakers
          .map((s) => {
            const match = s.speaker_id.match(/(\d+)/);
            return match ? parseInt(match[1], 10) : null;
          })
          .filter((n) => n !== null),
      );

      for (const [centroidId, centroid] of Object.entries(centroids)) {
        const numMatch = centroidId.match(/(\d+)/);
        if (!numMatch) continue;
        const num = parseInt(numMatch[1], 10);

        // Skip if we already have this speaker
        if (existingSpeakerNums.has(num)) continue;

        // Find matches against known fingerprints
        const matches: DetectedSpeaker["matches"] = [];
        if (centroid && fingerprints) {
          for (const fp of fingerprints) {
            if (fp.embedding && Array.isArray(fp.embedding)) {
              const similarity = cosineSimilarity(
                centroid as number[],
                fp.embedding,
              );
              if (similarity > 0.6) {
                const person = people?.find((p) => p.id === fp.person_id);
                if (person) {
                  matches.push({
                    person_id: fp.person_id,
                    person_name: person.name,
                    similarity,
                    fingerprint_id: fp.id,
                  });
                }
              }
            }
          }
          matches.sort((a, b) => b.similarity - a.similarity);
        }

        detectedSpeakers.push({
          speaker_id: centroidId,
          segment_count: 0,
          total_duration: 0,
          first_segment_time: 0,
          centroid: centroid as number[],
          matches,
        });
      }

      // Re-sort after adding centroid-only speakers
      detectedSpeakers.sort((a, b) => b.total_duration - a.total_duration);
    }
  }

  // Count people with fingerprints
  const fingerprintedCount =
    people?.filter((p) => p.voice_fingerprint_id).length || 0;

  return {
    meetings,
    currentMeeting,
    people,
    fingerprints,
    detectedSpeakers,
    transcriptSample,
    fingerprintedCount,
  };
}

export async function action({ request }: { request: Request }) {
  await requireAuth(request);
  const supabaseAdmin = getSupabaseAdminClient();
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save_fingerprint") {
    const personId = parseInt(formData.get("personId") as string);
    const meetingId = parseInt(formData.get("meetingId") as string);
    const centroidJson = formData.get("centroid") as string;

    if (!personId || !centroidJson) {
      return { error: "Missing person or centroid data" };
    }

    const centroid = JSON.parse(centroidJson);

    // Check if person already has a fingerprint
    const { data: existingPerson } = await supabaseAdmin
      .from("people")
      .select("voice_fingerprint_id")
      .eq("id", personId)
      .single();

    if (existingPerson?.voice_fingerprint_id) {
      // Update existing fingerprint
      const { error: updateError } = await supabaseAdmin
        .from("voice_fingerprints")
        .update({
          embedding: centroid,
          source_meeting_id: meetingId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPerson.voice_fingerprint_id);

      if (updateError) throw updateError;
    } else {
      // Create new fingerprint
      const { data: newFp, error: insertError } = await supabaseAdmin
        .from("voice_fingerprints")
        .insert({
          person_id: personId,
          embedding: centroid,
          source_meeting_id: meetingId,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Update person's voice_fingerprint_id
      await supabaseAdmin
        .from("people")
        .update({ voice_fingerprint_id: newFp.id })
        .eq("id", personId);
    }

    return { success: true };
  }

  if (intent === "delete_fingerprint") {
    const fingerprintId = formData.get("fingerprintId") as string;
    const personId = parseInt(formData.get("personId") as string);

    if (!fingerprintId) return { error: "Missing fingerprint ID" };

    // Clear person's reference first
    await supabaseAdmin
      .from("people")
      .update({ voice_fingerprint_id: null })
      .eq("id", personId);

    // Delete fingerprint
    const { error } = await supabaseAdmin
      .from("voice_fingerprints")
      .delete()
      .eq("id", fingerprintId);

    if (error) throw error;

    return { success: true };
  }

  return { error: "Unknown intent" };
}

export default function VoiceFingerprintsTool({ loaderData }: any) {
  const {
    meetings,
    currentMeeting,
    people,
    fingerprints,
    detectedSpeakers,
    transcriptSample,
    fingerprintedCount,
  } = loaderData;

  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
  const [assigningPerson, setAssigningPerson] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const audioRef = useRef<HTMLAudioElement>(null);
  const submit = useSubmit();
  const revalidator = useRevalidator();

  // Get sample segments for selected speaker
  const speakerSegments = transcriptSample.filter(
    (s: any) => s.speaker_name === selectedSpeaker,
  );

  const selectedSpeakerData = detectedSpeakers.find(
    (s: DetectedSpeaker) => s.speaker_id === selectedSpeaker,
  );

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0)
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const playSegment = (startTime: number) => {
    if (audioRef.current && currentMeeting?.direct_audio_url) {
      audioRef.current.currentTime = startTime;
      audioRef.current.play().catch((e) => console.error("Play error:", e));
      setIsPlaying(true);
    }
  };

  const handleSaveFingerprint = (personId: number) => {
    if (!selectedSpeakerData?.centroid || !currentMeeting) return;

    const formData = new FormData();
    formData.append("intent", "save_fingerprint");
    formData.append("personId", personId.toString());
    formData.append("meetingId", currentMeeting.id.toString());
    formData.append("centroid", JSON.stringify(selectedSpeakerData.centroid));

    submit(formData, { method: "post" });
    setAssigningPerson(null);
    setSelectedSpeaker(null);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [currentMeeting?.id]);

  // People with fingerprints (for the sidebar)
  const fingerprintedPeople =
    people?.filter((p: Person) => p.voice_fingerprint_id) || [];

  return (
    <div className="h-screen flex flex-col bg-zinc-50 overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b bg-white flex items-center px-6 gap-6 shrink-0">
        <h1 className="font-bold text-lg flex items-center gap-2">
          <Fingerprint className="h-5 w-5 text-purple-600" />
          Voice Fingerprints
        </h1>

        <div className="flex-1 max-w-sm">
          <form
            method="get"
            onChange={(e) => (e.currentTarget as any).submit()}
          >
            <select
              name="meetingId"
              className="w-full h-9 rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-sm"
              defaultValue={currentMeeting?.id || ""}
            >
              <option value="" disabled>
                Select a meeting...
              </option>
              {meetings?.map((m: any) => (
                <option key={m.id} value={m.id}>
                  {new Date(m.meeting_date).toLocaleDateString()} - {m.title}
                </option>
              ))}
            </select>
          </form>
        </div>

        <Badge variant="secondary" className="gap-1">
          <Fingerprint className="h-3 w-3" />
          {fingerprintedCount} people fingerprinted
        </Badge>

        <div className="flex-1" />

        <Button variant="outline" asChild>
          <Link to="/speaker-alias">Speaker Alias Tool</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/">Back to Dashboard</Link>
        </Button>
      </header>

      {currentMeeting ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel: Detected Speakers */}
          <div className="w-[400px] flex flex-col border-r bg-white shrink-0">
            <div className="p-4 border-b bg-zinc-50">
              <h2 className="font-bold text-sm mb-1">Detected Speakers</h2>
              <p className="text-xs text-zinc-500">
                {detectedSpeakers.length} speakers found in this meeting
              </p>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4 space-y-2">
                {detectedSpeakers.map((speaker: DetectedSpeaker) => {
                  const isSelected = selectedSpeaker === speaker.speaker_id;
                  const hasMatch = speaker.matches.length > 0;
                  const bestMatch = speaker.matches[0];
                  const hasCentroid = speaker.centroid !== null;

                  return (
                    <button
                      key={speaker.speaker_id}
                      onClick={() => setSelectedSpeaker(speaker.speaker_id)}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border transition-all",
                        isSelected
                          ? "bg-purple-50 border-purple-300 ring-2 ring-purple-200"
                          : hasMatch
                            ? "bg-green-50/50 border-green-200 hover:border-green-300"
                            : hasCentroid
                              ? "bg-white border-zinc-200 hover:border-purple-300"
                              : "bg-zinc-50 border-zinc-200 hover:border-zinc-300",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-sm flex items-center gap-2">
                            <Mic className="h-3.5 w-3.5 text-zinc-400" />
                            {speaker.speaker_id}
                          </div>
                          <div className="text-xs text-zinc-500 mt-0.5">
                            {speaker.segment_count} segments ·{" "}
                            {formatDuration(speaker.total_duration)}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          {!hasCentroid && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-amber-600 border-amber-200"
                            >
                              No embedding
                            </Badge>
                          )}
                          {hasMatch && (
                            <div className="flex items-center gap-1">
                              <Badge
                                variant="default"
                                className={cn(
                                  "text-[10px]",
                                  bestMatch.similarity > 0.85
                                    ? "bg-green-600"
                                    : bestMatch.similarity > 0.75
                                      ? "bg-yellow-600"
                                      : "bg-orange-600",
                                )}
                              >
                                {Math.round(bestMatch.similarity * 100)}%
                              </Badge>
                              <span className="text-xs font-medium text-green-700">
                                {bestMatch.person_name}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {isSelected && (
                        <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-400" />
                      )}
                    </button>
                  );
                })}

                {detectedSpeakers.length === 0 && (
                  <div className="text-center py-8 text-zinc-400">
                    <Mic className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No speakers detected</p>
                    <p className="text-xs mt-1">
                      Run diarization to detect speakers
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Center Panel: Speaker Details & Audio Samples */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedSpeaker ? (
              <>
                {/* Audio Player */}
                {currentMeeting.direct_audio_url && (
                  <audio
                    ref={audioRef}
                    src={currentMeeting.direct_audio_url}
                    className="hidden"
                    onError={() => {
                      console.error(
                        "Audio failed to load. Reporting failure...",
                      );
                      fetch("/api/report-video-failure", {
                        method: "POST",
                        body: new URLSearchParams({
                          meetingId: currentMeeting.id.toString(),
                        }),
                      })
                        .then(() => {
                          console.log("Reported failure. Revalidating...");
                          revalidator.revalidate();
                        })
                        .catch(console.error);
                    }}
                  />
                )}

                <div className="p-6 border-b bg-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <Mic className="h-5 w-5 text-purple-600" />
                        {selectedSpeaker}
                      </h2>
                      <p className="text-sm text-zinc-500 mt-1">
                        {selectedSpeakerData?.segment_count} segments ·{" "}
                        {formatDuration(
                          selectedSpeakerData?.total_duration || 0,
                        )}{" "}
                        total speaking time
                      </p>
                    </div>

                    {selectedSpeakerData?.centroid ? (
                      <div className="flex items-center gap-2">
                        {assigningPerson === selectedSpeaker ? (
                          <div className="flex items-center gap-2">
                            <select
                              className="h-9 border rounded-md px-2 text-sm min-w-[200px]"
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleSaveFingerprint(
                                    parseInt(e.target.value),
                                  );
                                }
                              }}
                              defaultValue=""
                            >
                              <option value="" disabled>
                                Select person...
                              </option>
                              <optgroup label="Council">
                                {people
                                  ?.filter((p: Person) => p.is_councillor)
                                  .map((p: Person) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}{" "}
                                      {p.voice_fingerprint_id ? "✓" : ""}
                                    </option>
                                  ))}
                              </optgroup>
                              <optgroup label="Others">
                                {people
                                  ?.filter((p: Person) => !p.is_councillor)
                                  .map((p: Person) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}{" "}
                                      {p.voice_fingerprint_id ? "✓" : ""}
                                    </option>
                                  ))}
                              </optgroup>
                            </select>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setAssigningPerson(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            onClick={() => setAssigningPerson(selectedSpeaker)}
                            className="bg-purple-600 hover:bg-purple-700"
                          >
                            <Fingerprint className="h-4 w-4 mr-2" />
                            Save as Fingerprint
                          </Button>
                        )}
                      </div>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-amber-600 border-amber-200"
                      >
                        No voice embedding available
                      </Badge>
                    )}
                  </div>

                  {/* Matches */}
                  {selectedSpeakerData?.matches &&
                    selectedSpeakerData.matches.length > 0 && (
                      <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                        <h3 className="text-sm font-bold text-green-800 mb-2">
                          Potential Matches
                        </h3>
                        <div className="space-y-2">
                          {selectedSpeakerData.matches
                            .slice(0, 5)
                            .map((match: any) => (
                              <div
                                key={match.fingerprint_id}
                                className="flex items-center justify-between p-2 bg-white rounded border border-green-100"
                              >
                                <div className="flex items-center gap-2">
                                  <User className="h-4 w-4 text-green-600" />
                                  <span className="font-medium">
                                    {match.person_name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge
                                    className={cn(
                                      match.similarity > 0.85
                                        ? "bg-green-600"
                                        : match.similarity > 0.75
                                          ? "bg-yellow-600"
                                          : "bg-orange-600",
                                    )}
                                  >
                                    {Math.round(match.similarity * 100)}% match
                                  </Badge>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-green-700 border-green-300 hover:bg-green-100"
                                    onClick={() =>
                                      handleSaveFingerprint(match.person_id)
                                    }
                                  >
                                    <Check className="h-3 w-3 mr-1" />
                                    Confirm
                                  </Button>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                </div>

                {/* Audio Samples */}
                <div className="flex-1 overflow-y-auto p-6">
                  <h3 className="font-bold text-sm mb-3 text-zinc-700">
                    Audio Samples ({speakerSegments.length})
                  </h3>
                  <div className="space-y-2">
                    {speakerSegments.slice(0, 20).map((seg: any) => (
                      <div
                        key={seg.id}
                        className={cn(
                          "p-3 rounded-lg border bg-white hover:border-purple-300 transition-colors",
                          currentTime >= seg.start_time &&
                            currentTime < seg.end_time
                            ? "ring-2 ring-purple-500 border-purple-300"
                            : "border-zinc-200",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => playSegment(seg.start_time)}
                          >
                            {isPlaying &&
                            currentTime >= seg.start_time &&
                            currentTime < seg.end_time ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge
                                variant="secondary"
                                className="text-[10px] font-mono"
                              >
                                {formatTime(seg.start_time)}
                              </Badge>
                              <span className="text-[10px] text-zinc-400">
                                {formatDuration(seg.end_time - seg.start_time)}
                              </span>
                            </div>
                            <p className="text-sm text-zinc-700 leading-relaxed">
                              {seg.text_content}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}

                    {speakerSegments.length > 20 && (
                      <p className="text-xs text-zinc-400 text-center py-2">
                        Showing first 20 of {speakerSegments.length} segments
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-zinc-400">
                <div className="text-center">
                  <Mic className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Select a speaker</p>
                  <p className="text-sm mt-1">
                    Listen to samples and confirm their identity
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel: Fingerprinted People */}
          <div className="w-[280px] flex flex-col border-l bg-white shrink-0">
            <div className="p-4 border-b bg-zinc-50">
              <h2 className="font-bold text-sm mb-1 flex items-center gap-2">
                <Fingerprint className="h-4 w-4 text-purple-600" />
                Registered Voices
              </h2>
              <p className="text-xs text-zinc-500">
                {fingerprintedPeople.length} people with voice fingerprints
              </p>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-3 space-y-1">
                {fingerprintedPeople.map((person: Person) => (
                  <div
                    key={person.id}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-zinc-50 group"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                        {person.image_url ? (
                          <img
                            src={person.image_url}
                            alt={person.name}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <User className="h-4 w-4 text-purple-600" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{person.name}</div>
                        {person.is_councillor && (
                          <div className="text-[10px] text-purple-600">
                            Councillor
                          </div>
                        )}
                      </div>
                    </div>
                    <Form
                      method="post"
                      className="opacity-0 group-hover:opacity-100"
                    >
                      <input
                        type="hidden"
                        name="intent"
                        value="delete_fingerprint"
                      />
                      <input
                        type="hidden"
                        name="fingerprintId"
                        value={person.voice_fingerprint_id || ""}
                      />
                      <input type="hidden" name="personId" value={person.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-zinc-400 hover:text-red-600"
                        title="Remove fingerprint"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Form>
                  </div>
                ))}

                {fingerprintedPeople.length === 0 && (
                  <div className="text-center py-8 text-zinc-400">
                    <Fingerprint className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">No voice fingerprints yet</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-400">
          <Fingerprint className="h-16 w-16 mb-4 opacity-20" />
          <p>Select a meeting to manage voice fingerprints.</p>
          <p className="text-sm mt-2">
            Voice fingerprints help automatically identify speakers across
            meetings.
          </p>
        </div>
      )}
    </div>
  );
}
