import type { Route } from "./+types/meeting-detail";
import {
  getMeetingById,
  getDocumentSectionsForMeeting,
  getExtractedDocumentsForMeeting,
} from "../services/meetings";
import { createSupabaseServerClient } from "../lib/supabase.server";
import type {
  Meeting,
  AgendaItem,
  TranscriptSegment,
  SpeakerAlias,
  Attendance,
  Person,
} from "../lib/types";
import { Link, useRevalidator, useRouteLoaderData } from "react-router";
import { ogImageUrl, ogUrl } from "../lib/og";

export const meta: Route.MetaFunction = ({ data }) => {
  if (!data?.meeting) return [{ title: "Meeting | ViewRoyal.ai" }];
  const m = data.meeting as Meeting;
  const title = `${m.title} | ViewRoyal.ai`;
  const description = m.summary
    || `${m.type || "Council Meeting"} on ${m.meeting_date}`;
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: m.title },
    { property: "og:description", content: description },
    { property: "og:type", content: "article" },
    { property: "og:url", content: ogUrl(`/meetings/${m.id}`) },
    { property: "og:image", content: ogImageUrl(m.title, { subtitle: m.meeting_date, type: "meeting" }) },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
  ];
};
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Separator } from "../components/ui/separator";
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Sparkles,
  CheckCircle2,
  XCircle,
  Mic,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { cn, formatDate } from "../lib/utils";
import {
  getSpeakerColorIndex,
  SPEAKER_COLORS,
  SPEAKER_BG_LIGHT_COLORS,
  SPEAKER_TEXT_COLORS,
  SPEAKER_BORDER_COLORS,
} from "../lib/colors";
import { useVideoPlayer } from "../hooks/useVideoPlayer";
import { useSpeakerStats } from "../hooks/useSpeakerStats";
import { getMeetingDuration } from "../lib/timeline-utils";
import { AgendaOverview } from "../components/meeting/AgendaOverview";
import { TranscriptDrawer } from "../components/meeting/TranscriptDrawer";
import { VideoWithSidebar } from "../components/meeting/VideoWithSidebar";
import { MotionsOverview } from "../components/meeting/MotionsOverview";
import {
  MeetingTabs,
  type MeetingTabId,
} from "../components/meeting/MeetingTabs";

export function HydrateFallback() {
  return <MeetingLoadingSkeleton />;
}

function MeetingLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        <div className="flex flex-col items-center justify-center py-32">
          <div className="relative mb-8">
            <div className="w-16 h-16 rounded-2xl bg-zinc-900 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="6 3 20 12 6 21 6 3" fill="currentColor" />
              </svg>
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
              <div className="w-2 h-2 bg-white rounded-full animate-ping" />
            </div>
          </div>

          <div
            className="text-lg font-bold text-zinc-900 mb-2"
            style={{ animation: "fade-up 0.3s ease-out" }}
          >
            Loading meeting
          </div>

          <div className="flex items-center gap-1.5 text-sm text-zinc-400">
            <span>Fetching video stream</span>
            <span
              className="inline-block w-1 h-1 rounded-full bg-zinc-400"
              style={{ animation: "pulse-dot 1.4s ease-in-out infinite" }}
            />
            <span
              className="inline-block w-1 h-1 rounded-full bg-zinc-400"
              style={{
                animation: "pulse-dot 1.4s ease-in-out 0.2s infinite",
              }}
            />
            <span
              className="inline-block w-1 h-1 rounded-full bg-zinc-400"
              style={{
                animation: "pulse-dot 1.4s ease-in-out 0.4s infinite",
              }}
            />
          </div>

          <div className="mt-8 w-48 h-1 bg-zinc-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full"
              style={{ animation: "progress 3s ease-in-out infinite" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { id } = params;

  try {
    const { supabase } = createSupabaseServerClient(request);
    const [data, documentSections, extractedDocuments] = await Promise.all([
      getMeetingById(supabase, id),
      getDocumentSectionsForMeeting(supabase, id),
      getExtractedDocumentsForMeeting(supabase, id),
    ]);

    return { ...data, documentSections, extractedDocuments };
  } catch (error: any) {
    console.error("[meeting-detail loader]", error?.message || error);
    if (error.message === "Meeting Not Found") {
      throw new Response("Meeting Not Found", { status: 404 });
    }
    throw new Response("Error loading meeting", { status: 500 });
  }
}

type TabId = MeetingTabId;

export default function MeetingDetail({ loaderData }: any) {
  const rootData = useRouteLoaderData("root") as { user: any } | undefined;
  const user = rootData?.user;

  const {
    meeting: rawMeeting,
    agendaItems: rawAgendaItems,
    transcript: rawTranscript,
    speakerAliases: rawSpeakerAliases,
    attendance: rawAttendance,
    people,
    activeCouncilMemberIds,
    documentSections,
    extractedDocuments,
  } = loaderData;

  // Hydrate data from normalized people map
  const meeting = useMemo(
    () => ({
      ...rawMeeting,
      chair: rawMeeting.chair_person_id
        ? people[rawMeeting.chair_person_id]
        : rawMeeting.chair,
    }),
    [rawMeeting, people],
  );

  const agendaItems = useMemo(
    () =>
      rawAgendaItems.map((item: any) => ({
        ...item,
        motions: (item.motions || []).map((motion: any) => ({
          ...motion,
          mover_person: motion.mover_id ? people[motion.mover_id] : undefined,
          seconder_person: motion.seconder_id
            ? people[motion.seconder_id]
            : undefined,
          votes: (motion.votes || []).map((vote: any) => ({
            ...vote,
            person: vote.person_id ? people[vote.person_id] : undefined,
          })),
        })),
      })),
    [rawAgendaItems, people],
  );

  const transcript = useMemo(
    () =>
      rawTranscript.map((s: any) => ({
        ...s,
        person: s.person_id ? people[s.person_id] : undefined,
      })),
    [rawTranscript, people],
  );

  const speakerAliases = useMemo(
    () =>
      rawSpeakerAliases.map((a: any) => ({
        ...a,
        person: a.person_id ? people[a.person_id] : undefined,
      })),
    [rawSpeakerAliases, people],
  );

  const attendance = useMemo(
    () =>
      rawAttendance.map((a: any) => ({
        ...a,
        person: a.person_id ? people[a.person_id] : undefined,
      })),
    [rawAttendance, people],
  );

  // Vimeo data — fetched client-side so it doesn't block page load
  const [vimeoData, setVimeoData] = useState<{
    direct_url?: string | null;
    direct_audio_url?: string | null;
  } | null>(null);

  useEffect(() => {
    if (!rawMeeting.video_url) return;
    const params = new URLSearchParams({
      video_url: rawMeeting.video_url,
      meeting_id: String(rawMeeting.id),
    });
    fetch(`/api/vimeo-url?${params}`)
      .then((res) => res.json())
      .then((data: any) => setVimeoData(data))
      .catch(() => setVimeoData(null));
  }, [rawMeeting.video_url, rawMeeting.id]);

  const directVideoUrl = vimeoData?.direct_url;
  const directAudioUrl = vimeoData?.direct_audio_url;

  // UI state
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [expandedAgendaItemId, setExpandedAgendaItemId] = useState<
    number | null
  >(null);
  const [transcriptDrawerOpen, setTranscriptDrawerOpen] = useState(false);
  const [transcriptSearchQuery, setTranscriptSearchQuery] = useState("");
  const [showCaption, setShowCaption] = useState(true);

  // Track if we've already reported a video error
  const hasReportedVideoError = useRef(false);
  const revalidator = useRevalidator();

  const handleVideoError = useCallback(() => {
    if (!hasReportedVideoError.current && meeting?.id) {
      hasReportedVideoError.current = true;
      console.error(
        "[Video] Error detected, reporting failure and revalidating...",
      );

      const formData = new FormData();
      formData.append("meetingId", meeting.id.toString());

      fetch("/api/report-video-failure", {
        method: "POST",
        body: formData,
      })
        .then(() => {
          console.log("Reported failure. Revalidating...");
          revalidator.revalidate();
          setTimeout(() => {
            hasReportedVideoError.current = false;
          }, 5000);
        })
        .catch((e) => console.error("Failed to report video error", e));
    }
  }, [meeting?.id, revalidator]);

  // Video player hook
  const videoPlayer = useVideoPlayer({
    directVideoUrl,
    directAudioUrl,
    onError: (error) => {
      console.error("[Video] HLS error:", error);
      handleVideoError();
    },
  });

  // Speaker map for resolving names
  const speakerMap = useMemo(() => {
    const map: Record<string, string> = {};
    speakerAliases.forEach((alias: any) => {
      if (alias.person) {
        const normalizedLabel = alias.speaker_label
          .toUpperCase()
          .replace(/\s+/g, "_");
        map[normalizedLabel] = alias.person.name;
        map[alias.speaker_label.toUpperCase()] = alias.person.name;
      }
    });
    return map;
  }, [speakerAliases]);

  const resolveSpeakerName = (seg: {
    person?: { name: string } | null;
    speaker_name?: string | null;
  }) => {
    if (seg.person?.name) return seg.person.name;
    const label = seg.speaker_name;
    if (!label) return "Unknown Speaker";
    const normalized = label.toUpperCase().replace(/\s+/g, "_");
    return speakerMap[normalized] || speakerMap[label.toUpperCase()] || label;
  };

  // Speaker stats hook
  const speakerStatsData = useSpeakerStats({
    transcript,
    attendance,
    speakerMap,
    meetingDate: meeting.meeting_date,
    resolveSpeakerName,
    activeCouncilMemberIds,
    people,
  });

  const { speakerStats, attendanceGroups, getPersonRole, formatDuration } =
    speakerStatsData;

  // Meeting duration
  const meetingDuration = useMemo(
    () => getMeetingDuration(rawTranscript),
    [rawTranscript],
  );

  // Handle video navigation from agenda
  const handleWatchVideo = (startTime: number, itemId?: number) => {
    if (itemId) {
      setExpandedAgendaItemId(itemId);
    }
    videoPlayer.seekTo(startTime);
  };

  // Handle agenda item expansion
  const handleAgendaItemClick = (itemId: number) => {
    setExpandedAgendaItemId(expandedAgendaItemId === itemId ? null : itemId);
  };

  // Calculate participant count
  const participantCount = useMemo(() => {
    return (
      attendanceGroups.council.length +
      attendanceGroups.staff.length +
      attendanceGroups.others.length
    );
  }, [attendanceGroups]);

  // Key decisions — non-procedural motions with results
  const allMotions = useMemo(
    () => agendaItems.flatMap((item: any) => item.motions || []),
    [agendaItems],
  );
  const keyDecisions = useMemo(() => {
    return agendaItems
      .flatMap((item: any) => {
        const category = item.category;
        return (item.motions || [])
          .filter((m: any) => {
            if (m.disposition === "Procedural") return false;
            if (category === "Procedural") return false;
            if (!m.result) return false;
            return true;
          })
          .map((m: any) => ({
            id: m.id,
            summary: m.plain_english_summary || m.text_content,
            result: m.result,
          }));
      })
      .slice(0, 5);
  }, [agendaItems]);

  const carriedCount = allMotions.filter(
    (m: any) => m.result === "CARRIED",
  ).length;

  // Duration formatting for stats
  const durationSeconds =
    meeting.video_duration_seconds ||
    (transcript.length > 0 ? transcript[transcript.length - 1].end_time : 0);
  const durationDisplay = useMemo(() => {
    if (!durationSeconds) return null;
    const h = Math.floor(durationSeconds / 3600);
    const m = Math.floor((durationSeconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }, [durationSeconds]);

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        {/* Back Link */}
        <Link
          to="/meetings"
          className="group flex items-center text-sm font-medium text-zinc-600 hover:text-blue-600 mb-6 transition-colors"
        >
          <ChevronLeft className="mr-1 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          Back to Meetings
        </Link>

        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 mb-2">
                {meeting.title}
              </h1>
              <div className="flex items-center gap-3 text-zinc-500">
                <Clock className="h-4 w-4" />
                <span className="font-medium">
                  {formatDate(meeting.meeting_date, {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
                {meeting.organization && (
                  <>
                    <Separator orientation="vertical" className="h-4" />
                    <span>{meeting.organization.name}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {user && meeting.video_url && (
                <Link
                  to={`/speaker-alias?meetingId=${meeting.id}`}
                  className="inline-flex items-center gap-2 text-zinc-500 hover:text-blue-600 font-medium text-sm py-2 px-4 rounded-full border border-zinc-200 hover:border-blue-200 transition-all"
                >
                  <Mic className="h-3.5 w-3.5" />
                  Speaker Aliases
                </Link>
              )}
              {meeting.video_url && !directVideoUrl && (
                <a
                  href={meeting.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-full transition-all shadow-md hover:shadow-lg hover:scale-105"
                >
                  Watch on Vimeo
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        </header>

        <div className="space-y-6">
          {/* Video Player */}
          {meeting.video_url && (
            <VideoWithSidebar
              videoPlayer={videoPlayer}
              directVideoUrl={directVideoUrl}
              directAudioUrl={directAudioUrl}
              meeting={meeting}
              agendaItems={agendaItems}
              transcript={transcript}
              meetingDuration={meetingDuration}
              resolveSpeakerName={resolveSpeakerName}
              showCaption={showCaption}
              setShowCaption={setShowCaption}
              onVideoError={handleVideoError}
            />
          )}

          {/* Tab Navigation */}
          <MeetingTabs
            meeting={meeting}
            agendaItems={agendaItems}
            transcript={transcript}
            participantCount={participantCount}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />

          {/* Tab Content */}
          <div className="min-h-[400px]">
            {activeTab === "overview" && (
              <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
                {/* Summary */}
                {meeting.summary && (
                  <div className="p-6">
                    <h2 className="text-lg font-bold mb-3 flex items-center gap-2 text-zinc-900">
                      <Sparkles className="h-5 w-5 text-amber-500 fill-amber-500/20" />
                      Meeting Overview
                    </h2>
                    <p className="text-zinc-700 leading-relaxed text-base md:text-lg">
                      {meeting.summary}
                    </p>
                  </div>
                )}

                {/* Key Decisions */}
                {keyDecisions.length > 0 && (
                  <div className={cn("px-6 pb-6", !meeting.summary && "pt-6")}>
                    <div className="p-4 bg-zinc-50 rounded-xl">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
                        Key Decisions
                      </h3>
                      <ul className="space-y-2">
                        {keyDecisions.map((decision: any) => (
                          <li
                            key={decision.id}
                            className="flex items-start gap-2 text-sm"
                          >
                            {decision.result === "CARRIED" ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                            )}
                            <span className="text-zinc-700 leading-relaxed">
                              {decision.summary}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Quick Stats */}
                <div className="flex gap-8 px-6 py-4 border-t border-zinc-100 bg-zinc-50/50">
                  <div>
                    <div className="text-2xl font-bold text-zinc-900">
                      {agendaItems.length}
                    </div>
                    <div className="text-xs text-zinc-500">Agenda Items</div>
                  </div>
                  {allMotions.length > 0 && (
                    <div>
                      <div className="text-2xl font-bold text-zinc-900">
                        {carriedCount}
                        <span className="text-sm font-normal text-zinc-400">
                          /{allMotions.length}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500">
                        Motions Passed
                      </div>
                    </div>
                  )}
                  {durationDisplay && (
                    <div>
                      <div className="text-2xl font-bold text-zinc-900">
                        {durationDisplay}
                      </div>
                      <div className="text-xs text-zinc-500">Duration</div>
                    </div>
                  )}
                  {participantCount > 0 && (
                    <div>
                      <div className="text-2xl font-bold text-zinc-900">
                        {participantCount}
                      </div>
                      <div className="text-xs text-zinc-500">Participants</div>
                    </div>
                  )}
                </div>

                {/* Documents */}
                {extractedDocuments && extractedDocuments.length > 0 && (
                  <div className="px-6 py-4 border-t border-zinc-100">
                    <Link
                      to={`/meetings/${meeting.id}/documents`}
                      className="flex items-center justify-between group"
                    >
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2 group-hover:text-zinc-600 transition-colors">
                        <FileText className="w-3.5 h-3.5" />
                        Documents
                        <span className="text-zinc-300 font-normal normal-case">
                          ({extractedDocuments.length})
                        </span>
                      </h3>
                      <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
                    </Link>
                  </div>
                )}

                {/* No content fallback */}
                {!meeting.summary && keyDecisions.length === 0 && (
                  <div className="p-6 text-center text-zinc-400">
                    <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">
                      No overview available for this meeting yet.
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "agenda" && (
              <AgendaOverview
                items={agendaItems}
                documentSections={documentSections}
                extractedDocuments={extractedDocuments}
                expandedItemId={expandedAgendaItemId}
                onItemClick={handleAgendaItemClick}
                onWatchVideo={(startTime, itemId) => {
                  handleWatchVideo(startTime, itemId);
                }}
              />
            )}

            {activeTab === "motions" && (
              <MotionsOverview
                agendaItems={agendaItems}
                onWatchMotion={(time) => {
                  videoPlayer.seekTo(time);
                }}
              />
            )}

            {activeTab === "participants" && (
              <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
                <ParticipationDashboard
                  attendanceGroups={attendanceGroups}
                  speakerStats={speakerStats}
                  getPersonRole={getPersonRole}
                  formatDuration={formatDuration}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transcript Drawer */}
      <TranscriptDrawer
        isOpen={transcriptDrawerOpen}
        onClose={() => setTranscriptDrawerOpen(false)}
        transcript={transcript}
        currentTime={videoPlayer.currentTime}
        onSegmentClick={videoPlayer.seekTo}
        searchQuery={transcriptSearchQuery}
        onSearchChange={setTranscriptSearchQuery}
        resolveSpeakerName={resolveSpeakerName}
      />
    </div>
  );
}

// Participation Dashboard
function ParticipationDashboard({
  attendanceGroups,
  speakerStats,
  getPersonRole,
  formatDuration,
}: {
  attendanceGroups: any;
  speakerStats: any;
  getPersonRole: (person?: Person) => string | null;
  formatDuration: (seconds: number) => string;
}) {
  return (
    <div className="p-6 space-y-8">
      {/* Participant Groups */}
      {[
        { label: "Council Members", data: attendanceGroups.council },
        { label: "Staff", data: attendanceGroups.staff },
        { label: "Public & Others", data: attendanceGroups.others },
      ].map(
        ({ label, data }) =>
          data.length > 0 && (
            <div key={label}>
              <div className="flex items-center gap-4 mb-4">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400 whitespace-nowrap">
                  {label}
                </h3>
                <Separator className="flex-1" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {data
                  .sort((a: any, b: any) => {
                    const timeA = speakerStats.stats[a.resolvedName || ""] || 0;
                    const timeB = speakerStats.stats[b.resolvedName || ""] || 0;
                    return timeB - timeA;
                  })
                  .map((record: any) => {
                    const name = record.resolvedName || "Unknown";
                    const colorIdx = getSpeakerColorIndex(name);
                    const time = speakerStats.stats[name] || 0;
                    const percent =
                      speakerStats.totalTime > 0
                        ? (time / speakerStats.totalTime) * 100
                        : 0;
                    const role = getPersonRole(record.person ?? undefined);
                    const isStaff = label === "Staff";
                    const isRegrets =
                      record.attendance_mode === "Regrets" ||
                      record.attendance_mode === "Absent";
                    const isRemote = record.attendance_mode === "Remote";

                    const cardContent = (
                      <div
                        className={cn(
                          "group p-4 rounded-xl border transition-all duration-300 h-full flex flex-col justify-between",
                          "bg-white hover:shadow-md hover:-translate-y-1",
                          time > 0
                            ? SPEAKER_BORDER_COLORS[colorIdx]
                            : "border-zinc-100",
                          record.isVirtual && "border-dashed",
                          isRegrets && "bg-zinc-50/50 opacity-75",
                        )}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 border-white shadow-sm shrink-0 transition-transform group-hover:scale-110",
                                time > 0
                                  ? SPEAKER_COLORS[colorIdx] + " text-white"
                                  : "bg-zinc-100 text-zinc-400",
                                isRegrets && "grayscale opacity-50",
                              )}
                            >
                              {name
                                .split(" ")
                                .map((n: string) => n[0])
                                .join("")
                                .substring(0, 2)
                                .toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-zinc-900 truncate group-hover:text-blue-600 transition-colors">
                                {name}
                              </div>
                              <div className="text-[10px] font-bold text-zinc-400 uppercase truncate leading-tight mt-0.5">
                                {isRegrets ? (
                                  <span className="italic text-zinc-500">
                                    {record.attendance_mode === "Absent"
                                      ? "Absent"
                                      : "Regrets"}
                                  </span>
                                ) : (
                                  role || (isStaff ? "Staff Member" : "Guest")
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1 items-end">
                            {record.isVirtual && (
                              <Badge
                                variant="outline"
                                className="text-[8px] h-4 px-1 border-dashed text-zinc-400"
                              >
                                Voice Only
                              </Badge>
                            )}
                            {isRemote && (
                              <Badge
                                variant="outline"
                                className="text-[8px] h-4 px-1 border-blue-200 text-blue-600 bg-blue-50"
                              >
                                Remote
                              </Badge>
                            )}
                          </div>
                        </div>

                        {time > 0 && (
                          <div className="mt-auto space-y-2">
                            <div className="flex items-center justify-between text-[10px] font-bold">
                              <span className="text-zinc-500 uppercase tracking-tighter">
                                Share of voice
                              </span>
                              <span className={SPEAKER_TEXT_COLORS[colorIdx]}>
                                {percent.toFixed(1)}%
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden shadow-inner ring-1 ring-zinc-50">
                              <div
                                className={cn(
                                  "h-full transition-all duration-1000",
                                  SPEAKER_COLORS[colorIdx],
                                )}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                            <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-zinc-400">
                              <Clock className="h-3 w-3" />
                              {formatDuration(time)}
                            </div>
                          </div>
                        )}
                      </div>
                    );

                    const isCouncil = label === "Council Members";
                    return isCouncil && record.person_id ? (
                      <Link
                        key={record.id}
                        to={`/people/${record.person_id}`}
                        className="block h-full"
                      >
                        {cardContent}
                      </Link>
                    ) : (
                      <div key={record.id} className="h-full">
                        {cardContent}
                      </div>
                    );
                  })}
              </div>
            </div>
          ),
      )}
    </div>
  );
}
