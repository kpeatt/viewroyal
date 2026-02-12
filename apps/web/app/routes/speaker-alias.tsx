import { useState, useEffect } from "react";
import {
  Form,
  useSubmit,
  useNavigation,
  Link,
  useRevalidator,
} from "react-router";
import { requireAuth } from "../lib/auth.server";
import {
  getSupabaseAdminClient,
  createSupabaseServerClient,
} from "../lib/supabase.server";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  FastForward,
  User,
  Users,
  Search,
  Target,
  Scissors,
  Loader2,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { ScrollArea } from "../components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import { cn } from "../lib/utils";
import { getVimeoVideoData } from "../services/vimeo.server";
import { getMeetingById } from "../services/meetings";
import { useVideoPlayer } from "../hooks/useVideoPlayer";

// Types
type Meeting = {
  id: number;
  title: string;
  meeting_date: string;
  video_url: string | null;
  direct_video_url?: string | null;
  direct_audio_url?: string | null;
};

type Segment = {
  id: number;
  start_time: number;
  end_time: number;
  speaker_name: string;
  text_content: string;
  corrected_text_content?: string;
  person_id: number | null;
  person?: {
    name: string;
    image_url: string | null;
  };
};

type Person = {
  id: number;
  name: string;
  image_url: string | null;
  is_councillor: boolean;
};

type SpeakerAlias = {
  id: number;
  speaker_label: string;
  person_id: number;
};

export async function loader({ request }: { request: Request }) {
  await requireAuth(request);
  const { supabase: serverClient } = createSupabaseServerClient(request);

  const url = new URL(request.url);
  const meetingId = url.searchParams.get("meetingId");

  // 1. Fetch all meetings for the dropdown
  const { data: meetings } = await serverClient
    .from("meetings")
    .select("id, title, meeting_date, video_url")
    .not("video_url", "is", null)
    .neq("video_url", "")
    .order("meeting_date", { ascending: false });

  let segments: Segment[] = [];
  let people: Person[] = [];
  let aliases: SpeakerAlias[] = [];
  let currentMeeting: Meeting | null = null;

  if (meetingId) {
    // 2. Fetch Meeting Details
    currentMeeting =
      meetings?.find((m) => m.id.toString() === meetingId) || null;

    if (currentMeeting) {
      // 3. Fetch People (for assignment & mapping)
      const { data: ppl } = await serverClient
        .from("people")
        .select("id, name, image_url, is_councillor")
        .order("name");

      people = ppl || [];
      const peopleMap = new Map(people.map((p) => [p.id, p]));

      // 4. Fetch Meeting Details (Transcript & Aliases) via Service
      try {
        const adminClient = getSupabaseAdminClient();
        const meetingData = await getMeetingById(adminClient, meetingId);
        aliases = meetingData.speakerAliases;

        // Create alias map for fallback
        const aliasMap = new Map();
        aliases.forEach((a) => {
          aliasMap.set(a.speaker_label, a.person_id);
        });

        segments = meetingData.transcript.map((t: any) => {
          const resolvedPersonId =
            t.person_id || aliasMap.get(t.speaker_name) || null;
          const resolvedPerson = resolvedPersonId
            ? peopleMap.get(resolvedPersonId)
            : undefined;

          return {
            id: t.id,
            start_time: t.start_time,
            end_time: t.end_time,
            speaker_name: t.speaker_name || "Unknown",
            text_content: t.text_content,
            corrected_text_content: t.corrected_text_content,
            person_id: t.person_id,
            person: resolvedPerson,
          };
        });
      } catch (e) {
        console.error("Error fetching meeting details:", e);
      }

      if (currentMeeting.video_url) {
        const vData = await getVimeoVideoData(
          currentMeeting.video_url,
          currentMeeting.id,
        );
        if (vData) {
          (currentMeeting as any).direct_video_url = vData.direct_url;
          (currentMeeting as any).direct_audio_url = vData.direct_audio_url;
        }
      }
    }
  }

  // Load speaker centroids and samples from meeting meta (for voice fingerprinting)
  let speakerCentroids: Record<string, number[]> = {};
  let speakerSamples: Record<string, { start: number; end: number }> = {};
  if (meetingId) {
    const { data: meetingMeta } = await serverClient
      .from("meetings")
      .select("meta")
      .eq("id", meetingId)
      .single();

    speakerCentroids = (meetingMeta?.meta as any)?.speaker_centroids || {};
    speakerSamples = (meetingMeta?.meta as any)?.speaker_samples || {};
  }

  // Load existing voice fingerprints for people
  const { data: fingerprints } = await serverClient
    .from("voice_fingerprints")
    .select("id, person_id");

  const peopleWithFingerprints = new Set(
    fingerprints?.map((f) => f.person_id) || [],
  );

  return {
    meetings,
    currentMeeting,
    segments,
    people,
    aliases,
    speakerCentroids,
    speakerSamples,
    peopleWithFingerprints: Array.from(peopleWithFingerprints),
  };
}

export async function action({ request }: { request: Request }) {
  await requireAuth(request);
  const supabaseAdmin = getSupabaseAdminClient();

  const formData = await request.formData();
  const intent = formData.get("intent");
  const meetingId = formData.get("meetingId");

  if (!meetingId) return { error: "No meeting ID" };

  if (intent === "assign_alias") {
    // Map a Speaker Label to a Person globally for this meeting
    const speakerLabel = formData.get("speakerLabel") as string;
    let personId = formData.get("personId");
    const newPersonName = formData.get("newPersonName") as string;

    if (!speakerLabel) return { error: "Missing label" };
    if (!personId && !newPersonName) return { error: "Missing person" };

    // Create person if needed
    if (newPersonName) {
      const { data: newPerson, error: createError } = await supabaseAdmin
        .from("people")
        .insert({ name: newPersonName })
        .select()
        .single();

      if (createError) throw createError;
      personId = newPerson.id;
    }

    // 1. Upsert Alias
    const { error: aliasError } = await supabaseAdmin
      .from("meeting_speaker_aliases")
      .upsert(
        {
          meeting_id: meetingId,
          speaker_label: speakerLabel,
          person_id: personId,
        },
        { onConflict: "meeting_id, speaker_label" },
      );

    if (aliasError) throw aliasError;

    // 2. Update all segments with this label
    const { error: updateError } = await supabaseAdmin
      .from("transcript_segments")
      .update({ person_id: personId })
      .eq("meeting_id", meetingId)
      .eq("speaker_name", speakerLabel);

    if (updateError) throw updateError;

    // 3. Save voice fingerprint if centroid provided
    const centroidJson = formData.get("centroid") as string;
    if (centroidJson && personId) {
      try {
        const centroid = JSON.parse(centroidJson);
        if (Array.isArray(centroid) && centroid.length === 192) {
          // Check if person already has a fingerprint
          const { data: existingFp } = await supabaseAdmin
            .from("voice_fingerprints")
            .select("id")
            .eq("person_id", personId)
            .maybeSingle();

          if (!existingFp) {
            // Create new fingerprint
            const { data: newFp, error: fpError } = await supabaseAdmin
              .from("voice_fingerprints")
              .insert({
                person_id: personId,
                embedding: centroid,
                source_meeting_id: meetingId,
                confidence: 1.0,
              })
              .select()
              .single();

            if (!fpError && newFp) {
              // Update person with voice_fingerprint_id
              await supabaseAdmin
                .from("people")
                .update({ voice_fingerprint_id: newFp.id })
                .eq("id", personId);
            }
          }
        }
      } catch (e) {
        console.error("Error saving voice fingerprint:", e);
      }
    }
  } else if (intent === "relabel_segments") {
    // Change the speaker label for specific segments
    // e.g. "Speaker 1" -> "Speaker 2" for selected segments
    const segmentIds = (formData.get("segmentIds") as string).split(",");
    const newLabel = formData.get("newLabel") as string;

    console.log(
      `Relabeling segments ${segmentIds.length} to "${newLabel}"`,
      segmentIds,
    );

    if (!segmentIds.length || !newLabel) return { error: "Missing data" };

    // Check if the new label has a person assigned
    const { data: existingAlias } = await supabaseAdmin
      .from("meeting_speaker_aliases")
      .select("person_id")
      .eq("meeting_id", meetingId)
      .eq("speaker_label", newLabel)
      .maybeSingle();

    const updates = {
      speaker_name: newLabel,
      person_id: existingAlias?.person_id || null,
    };

    const { error } = await supabaseAdmin
      .from("transcript_segments")
      .update(updates)
      .in(
        "id",
        segmentIds.map((id) => parseInt(id, 10)),
      );

    if (error) {
      console.error("Error updating segments:", error);
      throw error;
    }
  } else if (intent === "assign_person_segments") {
    // Manually assign specific segments to a person.
    // We try to use an existing label for this person if one exists (e.g. Speaker_07).
    // If not, we fall back to using their name as the label.
    const segmentIds = (formData.get("segmentIds") as string).split(",");
    let personId = formData.get("personId");
    const newPersonName = formData.get("newPersonName") as string;

    if (!segmentIds.length) return { error: "Missing segments" };
    if (!personId && !newPersonName) return { error: "Missing person" };

    // 0. If creating a new person, insert them first
    if (newPersonName) {
      const { data: newPerson, error: createError } = await supabaseAdmin
        .from("people")
        .insert({ name: newPersonName })
        .select()
        .single();

      if (createError) throw createError;
      personId = newPerson.id;
    }

    // 1. Check if there is already an alias for this person in this meeting
    const { data: existingAliases } = await supabaseAdmin
      .from("meeting_speaker_aliases")
      .select("speaker_label")
      .eq("meeting_id", meetingId)
      .eq("person_id", personId)
      .limit(1);

    let targetLabel = existingAliases?.[0]?.speaker_label;

    // 1b. If no explicit alias, check if this person is already assigned to any segments in this meeting
    // preventing fragmentation (e.g. creating "Ivan Leung" label when "Speaker_07" is already Ivan)
    if (!targetLabel) {
      const { data: existingSegment } = await supabaseAdmin
        .from("transcript_segments")
        .select("speaker_name")
        .eq("meeting_id", meetingId)
        .eq("person_id", personId)
        .limit(1)
        .maybeSingle();

      if (existingSegment) {
        targetLabel = existingSegment.speaker_name;
      }
    }

    // 2. If no alias exists, fetch the person's name to use as a new label
    if (!targetLabel) {
      const { data: person } = await supabaseAdmin
        .from("people")
        .select("name")
        .eq("id", personId)
        .single();

      if (!person) return { error: "Person not found" };

      targetLabel = person.name;

      // Ensure an alias exists for this new label
      await supabaseAdmin.from("meeting_speaker_aliases").upsert(
        {
          meeting_id: meetingId,
          speaker_label: targetLabel,
          person_id: personId,
        },
        { onConflict: "meeting_id, speaker_label" },
      );
    }

    // 3. Update the segments
    const { error } = await supabaseAdmin
      .from("transcript_segments")
      .update({
        person_id: personId,
        speaker_name: targetLabel,
      })
      .in("id", segmentIds);

    if (error) throw error;
  } else if (intent === "split_segment") {
    const segmentId = formData.get("segmentId");
    const text1 = formData.get("text1") as string;
    const text2 = formData.get("text2") as string;
    const splitTime = parseFloat(formData.get("splitTime") as string);

    if (!segmentId || !text1 || !text2 || isNaN(splitTime))
      return { error: "Missing split data" };

    const { data: original } = await supabaseAdmin
      .from("transcript_segments")
      .select("*")
      .eq("id", segmentId)
      .single();

    if (!original) return { error: "Segment not found" };

    // Update original (first part)
    const { error: updateError } = await supabaseAdmin
      .from("transcript_segments")
      .update({
        text_content: text1,
        end_time: splitTime,
        corrected_text_content: null, // Clear correction
      })
      .eq("id", segmentId);

    if (updateError) throw updateError;

    // Insert new (second part)
    const { error: insertError } = await supabaseAdmin
      .from("transcript_segments")
      .insert({
        meeting_id: original.meeting_id,
        speaker_name: original.speaker_name,
        person_id: original.person_id,
        start_time: splitTime,
        end_time: original.end_time,
        text_content: text2,
      });

    if (insertError) throw insertError;
  }

  return { success: true };
}

export default function SpeakerAliasTool({ loaderData }: any) {
  const {
    meetings,
    currentMeeting,
    segments,
    people,
    aliases,
    speakerCentroids,
    speakerSamples,
    peopleWithFingerprints,
  } = loaderData;

  // Helper to find centroid for a speaker label (handles format variations)
  const findCentroid = (speakerLabel: string): number[] | null => {
    if (!speakerCentroids) return null;

    // Direct match
    if (speakerCentroids[speakerLabel]) return speakerCentroids[speakerLabel];

    // Extract number and try variations
    const numMatch = speakerLabel.match(/(\d+)/);
    if (!numMatch) return null;
    const num = parseInt(numMatch[1], 10);

    const formats = [
      `SPEAKER_${num.toString().padStart(2, "0")}`,
      `SPEAKER_${num}`,
      `Speaker_${num}`,
      `speaker_${num}`,
    ];

    for (const fmt of formats) {
      if (speakerCentroids[fmt]) return speakerCentroids[fmt];
    }

    return null;
  };

  // Sort people: Active speakers (aliased) first
  const activePersonIds = new Set(aliases?.map((a: any) => a.person_id) || []);
  const sortedPeople = [...(people || [])].sort((a: any, b: any) => {
    const aActive = activePersonIds.has(a.id);
    const bActive = activePersonIds.has(b.id);
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return a.name.localeCompare(b.name);
  });

  const [selectedSegments, setSelectedSegments] = useState<Set<number>>(
    new Set(),
  );
  const [lastSelectedId, setLastSelectedId] = useState<number | null>(null);
  const [bulkMode, setBulkMode] = useState<"label" | "person" | null>(null);
  const [isCreatingPerson, setIsCreatingPerson] = useState(false);
  const [creatingForSpeaker, setCreatingForSpeaker] = useState<string | null>(
    null,
  );
  const [showCorrected, setShowCorrected] = useState(true);
  const [splitSegment, setSplitSegment] = useState<Segment | null>(null);
  const [splitText1, setSplitText1] = useState("");
  const [splitText2, setSplitText2] = useState("");

  // Filtering
  const [filterText, setFilterText] = useState("");
  const [filterSpeaker, setFilterSpeaker] = useState<string>("all");
  const [isFilterEnabled, setIsFilterEnabled] = useState(true);

  const submit = useSubmit();
  const navigation = useNavigation();
  const revalidator = useRevalidator();

  const handleVideoError = () => {
    console.error("Video failed to load. Reporting failure...");
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
      .catch((e) => console.error("Failed to report error", e));
  };

  // Use the shared video player hook
  const videoPlayer = useVideoPlayer({
    directVideoUrl: currentMeeting?.direct_video_url,
    directAudioUrl: currentMeeting?.direct_audio_url,
    initialVolume: 1,
    onError: handleVideoError,
  });

  // Reset video when meeting changes
  useEffect(() => {
    videoPlayer.setVideoEnabled(false);
  }, [currentMeeting?.id]);

  // Handle segment selection (Shift+Click support)
  const toggleSelection = (id: number, shiftKey: boolean) => {
    const newSet = new Set(selectedSegments);

    if (shiftKey && lastSelectedId !== null) {
      // Find range
      const ids = segments.map((s: any) => s.id);
      const idx1 = ids.indexOf(lastSelectedId);
      const idx2 = ids.indexOf(id);
      if (idx1 !== -1 && idx2 !== -1) {
        const start = Math.min(idx1, idx2);
        const end = Math.max(idx1, idx2);
        for (let i = start; i <= end; i++) {
          newSet.add(ids[i]);
        }
      }
    } else {
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
    }

    setSelectedSegments(newSet);
    setLastSelectedId(id);
  };

  const seekTo = (time: number) => {
    videoPlayer.seekTo(time);
  };

  // Filtered Segments
  const filteredSegments = segments.filter((s: any) => {
    if (
      isFilterEnabled &&
      filterSpeaker !== "all" &&
      s.speaker_name !== filterSpeaker
    )
      return false;

    const text = showCorrected
      ? s.corrected_text_content || s.text_content
      : s.text_content;
    if (filterText && !text.toLowerCase().includes(filterText.toLowerCase()))
      return false;
    return true;
  });

  // Unique speakers for filter
  const uniqueSpeakers = Array.from(
    new Set(segments.map((s: any) => s.speaker_name)),
  ).sort() as string[];

  // Action Handlers

  const handleBulkPerson = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    formData.append("meetingId", currentMeeting.id.toString());
    formData.append("segmentIds", Array.from(selectedSegments).join(","));

    const selection = formData.get("personId") as string;
    if (selection && selection.startsWith("LABEL:")) {
      formData.append("intent", "relabel_segments");
      formData.append("newLabel", selection.replace("LABEL:", ""));
      formData.delete("personId");
    } else {
      formData.append("intent", "assign_person_segments");
    }

    submit(formData, { method: "post" });
    setSelectedSegments(new Set());
    setBulkMode(null);
    setIsCreatingPerson(false);
  };

  const handleAliasAssign = (
    label: string,
    personId: string | null,
    newName?: string,
  ) => {
    const formData = new FormData();
    formData.append("meetingId", currentMeeting.id.toString());
    formData.append("speakerLabel", label);
    if (personId) formData.append("personId", personId);
    if (newName) formData.append("newPersonName", newName);
    formData.append("intent", "assign_alias");

    // Include centroid for voice fingerprinting if available
    const centroid = findCentroid(label);
    if (centroid) {
      formData.append("centroid", JSON.stringify(centroid));
    }

    submit(formData, { method: "post" });
    setCreatingForSpeaker(null);
  };

  const handleScrollToCurrent = () => {
    let activeSegment = null;
    for (let i = filteredSegments.length - 1; i >= 0; i--) {
      if (filteredSegments[i].start_time <= videoPlayer.currentTime) {
        activeSegment = filteredSegments[i];
        break;
      }
    }

    if (activeSegment) {
      const el = document.getElementById(`segment-${activeSegment.id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  const handleSplitSubmit = () => {
    if (!splitSegment) return;
    const duration = splitSegment.end_time - splitSegment.start_time;
    const totalLen = splitText1.length + splitText2.length;
    // Estimate split time based on text length ratio
    const ratio = totalLen > 0 ? splitText1.length / totalLen : 0.5;
    const splitTime = splitSegment.start_time + duration * ratio;

    const formData = new FormData();
    formData.append("meetingId", currentMeeting.id.toString());
    formData.append("segmentId", splitSegment.id.toString());
    formData.append("text1", splitText1);
    formData.append("text2", splitText2);
    formData.append("splitTime", splitTime.toString());
    formData.append("intent", "split_segment");
    submit(formData, { method: "post" });
    setSplitSegment(null);
  };

  return (
    <div className="h-screen flex flex-col bg-zinc-50 overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b bg-white flex items-center px-6 gap-6 shrink-0">
        <h1 className="font-bold text-lg flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-600" />
          Speaker Alias Tool
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

        <div className="flex-1" />

        <Button variant="outline" asChild>
          <Link to="/">Back to Dashboard</Link>
        </Button>
      </header>

      {currentMeeting ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel: Video & Aliases */}
          <div className="w-[600px] flex flex-col border-r bg-white shrink-0 z-10 shadow-xl">
            <div className="aspect-video bg-black sticky top-0 relative group">
              {!currentMeeting.direct_video_url ? (
                <div className="flex items-center justify-center h-full text-zinc-500">
                  No Video Available
                </div>
              ) : !videoPlayer.videoEnabled ? (
                <div
                  className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-900 transition-colors"
                  onClick={() => videoPlayer.setVideoEnabled(true)}
                >
                  <Play className="h-16 w-16 text-white opacity-80" />
                  <span className="text-white font-bold mt-2">
                    Click to Load Video
                  </span>
                </div>
              ) : (
                <>
                  <video
                    ref={videoPlayer.videoRef}
                    src={currentMeeting.direct_video_url}
                    className="w-full h-full"
                    onClick={videoPlayer.togglePlay}
                    preload="metadata"
                    muted={
                      !!currentMeeting.direct_audio_url ||
                      videoPlayer.volume === 0
                    }
                    onError={handleVideoError}
                  />
                  {currentMeeting.direct_audio_url && (
                    <audio
                      ref={videoPlayer.audioRef}
                      src={currentMeeting.direct_audio_url}
                      className="hidden"
                      preload="metadata"
                      muted={videoPlayer.volume === 0}
                    />
                  )}
                  {/* Loading indicator */}
                  {videoPlayer.isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Loader2 className="h-8 w-8 text-white animate-spin" />
                    </div>
                  )}
                  {/* Custom Controls */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-2">
                    <input
                      type="range"
                      min={0}
                      max={videoPlayer.duration || 100}
                      value={videoPlayer.currentTime}
                      onChange={(e) =>
                        videoPlayer.seekTo(parseFloat(e.target.value))
                      }
                      className="w-full h-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
                    />
                    <div className="flex items-center justify-between text-white">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={videoPlayer.togglePlay}
                          className="hover:text-blue-400"
                        >
                          {videoPlayer.isPlaying ? (
                            <Pause className="h-5 w-5 fill-current" />
                          ) : (
                            <Play className="h-5 w-5 fill-current" />
                          )}
                        </button>
                        <div className="flex items-center gap-2 group/vol relative">
                          <button
                            onClick={videoPlayer.toggleMute}
                            className="hover:text-blue-400"
                            title={videoPlayer.volume === 0 ? "Unmute" : "Mute"}
                          >
                            {videoPlayer.volume === 0 ? (
                              <VolumeX className="h-4 w-4" />
                            ) : (
                              <Volume2 className="h-4 w-4" />
                            )}
                          </button>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.1}
                            value={videoPlayer.volume}
                            onChange={(e) =>
                              videoPlayer.setVolume(parseFloat(e.target.value))
                            }
                            className="w-20 h-1 bg-white/30 rounded-full cursor-pointer"
                          />
                        </div>
                        <span className="text-xs font-mono">
                          {new Date(videoPlayer.currentTime * 1000)
                            .toISOString()
                            .substr(11, 8)}{" "}
                          /{" "}
                          {new Date((videoPlayer.duration || 0) * 1000)
                            .toISOString()
                            .substr(11, 8)}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          const rates = [1, 1.5, 2];
                          const nextIdx =
                            (rates.indexOf(videoPlayer.playbackRate) + 1) %
                            rates.length;
                          videoPlayer.setPlaybackRate(rates[nextIdx]);
                        }}
                        className="flex items-center gap-1 hover:text-blue-400 text-xs font-bold"
                      >
                        <FastForward className="h-4 w-4" />
                        {videoPlayer.playbackRate}x
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="p-4 border-b bg-zinc-50">
              <h3 className="font-bold text-sm mb-3">Detected Speakers</h3>
              <ScrollArea className="h-[280px] pr-4">
                <div className="space-y-2">
                  {uniqueSpeakers.map((speaker) => {
                    const alias = aliases.find(
                      (a: any) => a.speaker_label === speaker,
                    );
                    const assignedPerson = alias
                      ? people.find((p: any) => p.id === alias.person_id)
                      : null;
                    const centroid = findCentroid(speaker);
                    const hasCentroid = !!centroid;
                    const personHasFingerprint =
                      assignedPerson &&
                      peopleWithFingerprints?.includes(assignedPerson.id);

                    // Find sample for this speaker (try multiple key formats)
                    const numMatch = speaker.match(/(\d+)/);
                    const num = numMatch ? parseInt(numMatch[1], 10) : null;
                    const sampleKeys =
                      num !== null
                        ? [
                            speaker,
                            `SPEAKER_${num.toString().padStart(2, "0")}`,
                            `SPEAKER_${num}`,
                            `Speaker_${num}`,
                          ]
                        : [speaker];
                    const sample = sampleKeys.reduce(
                      (found, key) => found || speakerSamples?.[key],
                      null as any,
                    );
                    const hasSample = sample?.start !== undefined;

                    const playSample = () => {
                      if (!hasSample) return;

                      // Scroll video into view
                      if (videoPlayer.videoRef.current) {
                        (
                          videoPlayer.videoRef.current as HTMLElement
                        ).scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }

                      // Use the hook's seekTo which handles enabling video automatically
                      videoPlayer.seekTo(sample.start);
                    };

                    return (
                      <div
                        key={speaker}
                        className={cn(
                          "flex flex-col gap-1.5 p-2 rounded border text-sm transition-colors",
                          assignedPerson
                            ? personHasFingerprint
                              ? "bg-green-50/50 border-green-200"
                              : "bg-blue-50/50 border-blue-200"
                            : "bg-white border-zinc-200",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {/* Play button */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className={cn(
                              "h-7 w-7 p-0 shrink-0",
                              hasSample
                                ? "text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                                : "text-zinc-300 cursor-not-allowed",
                            )}
                            onClick={playSample}
                            disabled={!hasSample}
                            title={
                              hasSample ? `Play sample` : "No sample available"
                            }
                          >
                            <Play className="h-4 w-4" />
                          </Button>

                          {/* Speaker info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-zinc-900 text-xs">
                                {speaker}
                              </span>
                              {hasCentroid && (
                                <span title="Voice embedding available">
                                  <Volume2 className="h-3 w-3 text-green-600 shrink-0" />
                                </span>
                              )}
                              {assignedPerson && (
                                <span className="text-[10px] text-blue-700 font-semibold flex items-center gap-0.5 bg-blue-100 px-1.5 py-0.5 rounded">
                                  <User className="h-2.5 w-2.5" />
                                  {assignedPerson.name}
                                  {personHasFingerprint && (
                                    <span className="text-green-600 ml-0.5">
                                      ✓
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>

                          <Badge
                            variant="outline"
                            className="text-[10px] shrink-0"
                          >
                            {
                              segments.filter(
                                (s: any) => s.speaker_name === speaker,
                              ).length
                            }
                          </Badge>
                        </div>

                        {/* Assignment dropdown */}
                        <div className="flex gap-2 pl-9">
                          {creatingForSpeaker === speaker ? (
                            <div className="flex flex-1 gap-1">
                              <Input
                                autoFocus
                                className="h-7 text-xs"
                                placeholder="New Person Name..."
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleAliasAssign(
                                      speaker,
                                      null,
                                      e.currentTarget.value,
                                    );
                                  }
                                  if (e.key === "Escape") {
                                    setCreatingForSpeaker(null);
                                  }
                                }}
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-zinc-400 hover:text-red-600"
                                onClick={() => setCreatingForSpeaker(null)}
                              >
                                X
                              </Button>
                            </div>
                          ) : (
                            <select
                              className={cn(
                                "flex-1 h-7 text-xs border rounded",
                                assignedPerson
                                  ? "bg-white border-blue-200 text-blue-700 font-medium"
                                  : "bg-zinc-50 border-zinc-200 text-zinc-600",
                              )}
                              value={assignedPerson?.id || ""}
                              onChange={(e) => {
                                if (e.target.value === "NEW") {
                                  setCreatingForSpeaker(speaker);
                                } else if (e.target.value) {
                                  handleAliasAssign(speaker, e.target.value);
                                }
                              }}
                            >
                              <option value="">Assign person...</option>
                              <option
                                value="NEW"
                                className="font-bold text-blue-600"
                              >
                                + Create New Person
                              </option>
                              <optgroup label="Council">
                                {people
                                  .filter((p: any) => p.is_councillor)
                                  .map((p: any) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                              </optgroup>
                              <optgroup label="Others">
                                {people
                                  .filter((p: any) => !p.is_councillor)
                                  .map((p: any) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                              </optgroup>
                            </select>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Bulk Actions Panel */}
            <div className="p-4 flex-1 bg-blue-50/50">
              <h3 className="font-bold text-sm mb-3 text-blue-900">
                Selection Action ({selectedSegments.size})
              </h3>
              <div className="space-y-2">
                <Button
                  size="sm"
                  className="w-full justify-start"
                  disabled={selectedSegments.size === 0}
                  onClick={() => setBulkMode("person")}
                  variant={bulkMode === "person" ? "default" : "outline"}
                >
                  <User className="mr-2 h-4 w-4" />
                  Assign Person
                </Button>

                {bulkMode === "person" && (
                  <Form
                    onSubmit={handleBulkPerson}
                    className="p-2 bg-white rounded border mb-2"
                  >
                    {isCreatingPerson ? (
                      <div className="mb-2">
                        <Input
                          name="newPersonName"
                          placeholder="Enter New Person Name"
                          className="h-8 text-sm mb-2"
                          autoFocus
                        />
                        <div
                          className="text-[10px] text-blue-600 cursor-pointer hover:underline flex items-center gap-1"
                          onClick={() => setIsCreatingPerson(false)}
                        >
                          ← Select existing person
                        </div>
                      </div>
                    ) : (
                      <div className="mb-2">
                        <select
                          name="personId"
                          className="w-full h-8 text-sm border rounded bg-white mb-1"
                        >
                          <option value="">Select Person...</option>
                          <optgroup label="Speaker Labels">
                            {uniqueSpeakers.sort().map((s) => (
                              <option key={s} value={`LABEL:${s}`}>
                                {s}
                              </option>
                            ))}
                          </optgroup>
                          {activePersonIds.size > 0 && (
                            <optgroup label="Active People">
                              {sortedPeople
                                .filter((p) => activePersonIds.has(p.id))
                                .map((p: any) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                            </optgroup>
                          )}
                          <optgroup label="All People">
                            {sortedPeople
                              .filter((p) => !activePersonIds.has(p.id))
                              .map((p: any) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                          </optgroup>
                        </select>
                        <div
                          className="text-[10px] text-blue-600 cursor-pointer hover:underline"
                          onClick={() => setIsCreatingPerson(true)}
                        >
                          + Create new person
                        </div>
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        onClick={() => {
                          setBulkMode(null);
                          setIsCreatingPerson(false);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button size="sm" type="submit">
                        Apply
                      </Button>
                    </div>
                  </Form>
                )}

                <div className="text-xs text-zinc-500 mt-4">
                  Tip: Hold SHIFT to select range.
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel: Transcript */}
          <div className="flex-1 flex flex-col h-full overflow-hidden min-h-0">
            {/* Toolbar */}
            <div className="h-12 border-b flex items-center px-4 gap-4 bg-white shrink-0">
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-zinc-400" />
                <Input
                  placeholder="Search text..."
                  className="pl-8 h-8"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="w-64">
                  <select
                    className={cn(
                      "w-full h-8 border rounded text-sm px-2 transition-opacity",
                      !isFilterEnabled &&
                        filterSpeaker !== "all" &&
                        "opacity-50",
                    )}
                    value={filterSpeaker}
                    onChange={(e) => {
                      setFilterSpeaker(e.target.value);
                      setIsFilterEnabled(true);
                    }}
                  >
                    <option value="all">All Speakers</option>
                    {uniqueSpeakers.map((s) => {
                      const alias = aliases.find(
                        (a: any) => a.speaker_label === s,
                      );
                      const person = alias
                        ? people.find((p: any) => p.id === alias.person_id)
                        : null;
                      return (
                        <option key={s} value={s}>
                          {s} {person ? `(${person.name})` : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
                {filterSpeaker !== "all" && (
                  <Button
                    variant={isFilterEnabled ? "outline" : "secondary"}
                    size="sm"
                    className="h-8 text-xs whitespace-nowrap"
                    onClick={() => setIsFilterEnabled(!isFilterEnabled)}
                  >
                    {isFilterEnabled ? "View Context" : "Filter View"}
                  </Button>
                )}
              </div>
              <div className="ml-auto flex items-center gap-4 text-xs text-zinc-400">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-zinc-500 hover:text-blue-600"
                  onClick={handleScrollToCurrent}
                  title="Jump to current segment"
                >
                  <Target className="h-4 w-4" />
                </Button>
                <div className="h-4 w-px bg-zinc-200" />
                <label className="flex items-center gap-1.5 cursor-pointer text-zinc-600 font-medium hover:text-blue-600 transition-colors">
                  <input
                    type="checkbox"
                    checked={showCorrected}
                    onChange={(e) => setShowCorrected(e.target.checked)}
                    className="rounded border-zinc-300 text-blue-600 focus:ring-blue-600"
                  />
                  Show Fixed Text
                </label>
                <div className="h-4 w-px bg-zinc-200" />
                {filteredSegments.length} segments
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-1 pb-20 p-4">
                {filteredSegments.map((segment: any) => {
                  const isSelected = selectedSegments.has(segment.id);
                  const isCurrentSegment =
                    videoPlayer.currentTime >= segment.start_time &&
                    videoPlayer.currentTime < segment.start_time + 10;

                  return (
                    <div
                      key={segment.id}
                      id={`segment-${segment.id}`}
                      className={cn(
                        "group flex gap-3 p-3 rounded-lg border transition-colors hover:border-blue-300",
                        isSelected
                          ? "bg-blue-50 border-blue-200"
                          : "bg-white border-zinc-100",
                        isCurrentSegment &&
                          "ring-2 ring-blue-500 ring-offset-2",
                      )}
                      onClick={(e) => {
                        if (
                          !(e.target as HTMLElement).closest(
                            'input[type="checkbox"]',
                          )
                        ) {
                          // seekTo(segment.start_time);
                        }
                      }}
                    >
                      <div className="pt-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelection(
                              segment.id,
                              (e as any).nativeEvent.shiftKey,
                            );
                          }}
                          className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-600"
                        />
                      </div>

                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="font-mono text-[10px] cursor-pointer hover:bg-zinc-200"
                            onClick={() => seekTo(segment.start_time)}
                          >
                            {new Date(segment.start_time * 1000)
                              .toISOString()
                              .substr(11, 8)}{" "}
                            <Play className="h-2 w-2 ml-1 inline" />
                          </Badge>

                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200 shadow-sm">
                              {segment.speaker_name}
                            </span>
                            {segment.person &&
                              segment.person.name !== segment.speaker_name && (
                                <>
                                  <span className="text-zinc-300 text-[10px]">
                                    →
                                  </span>
                                  <span className="flex items-center gap-1 text-xs text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 shadow-sm">
                                    <User className="h-3 w-3" />
                                    {segment.person.name}
                                  </span>
                                </>
                              )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity ml-auto text-zinc-400 hover:text-blue-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSplitSegment(segment);
                              setSplitText1(segment.text_content);
                              setSplitText2("");
                            }}
                            title="Split Segment"
                          >
                            <Scissors className="h-3 w-3" />
                          </Button>
                        </div>

                        <p className="text-sm text-zinc-800 leading-relaxed">
                          {showCorrected
                            ? segment.corrected_text_content ||
                              segment.text_content
                            : segment.text_content}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-400">
          <Users className="h-16 w-16 mb-4 opacity-20" />
          <p>Select a meeting to start aliasing speakers.</p>
        </div>
      )}

      <Dialog
        open={!!splitSegment}
        onOpenChange={(open) => !open && setSplitSegment(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Split Segment</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">First Part</label>
              <textarea
                className="w-full min-h-[100px] p-2 border rounded-md text-sm"
                value={splitText1}
                onChange={(e) => setSplitText1(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Second Part</label>
              <textarea
                className="w-full min-h-[100px] p-2 border rounded-md text-sm"
                value={splitText2}
                onChange={(e) => setSplitText2(e.target.value)}
                placeholder="Cut/Paste text here to split..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSplitSegment(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSplitSubmit}
              disabled={!splitText1 || !splitText2}
            >
              Split Segment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
