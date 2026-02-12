import {
  Clock,
  FileText,
  Gavel,
  Users,
  Play,
  ChevronRight,
} from "lucide-react";
import type {
  Meeting,
  AgendaItem,
  TranscriptSegment,
  Motion,
} from "../../lib/types";
import { cn } from "../../lib/utils";

interface MeetingQuickStatsProps {
  meeting: Meeting;
  agendaItems: AgendaItem[];
  transcript: TranscriptSegment[];
  participantCount: number;
  onPlayVideo?: () => void;
  onScrollToAgenda?: () => void;
  onScrollToParticipants?: () => void;
  className?: string;
}

export function MeetingQuickStats({
  meeting,
  agendaItems,
  transcript,
  participantCount,
  onPlayVideo,
  onScrollToAgenda,
  onScrollToParticipants,
  className,
}: MeetingQuickStatsProps) {
  // Calculate meeting duration from transcript or video
  const durationSeconds =
    meeting.video_duration_seconds ||
    (transcript.length > 0 ? transcript[transcript.length - 1].end_time : 0);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) {
      return `${h}h ${m}m`;
    }
    return `${m}m`;
  };

  // Count motions and their results
  const allMotions = agendaItems.flatMap((item) => item.motions || []);
  const carriedCount = allMotions.filter((m) => m.result === "CARRIED").length;
  const defeatedCount = allMotions.filter(
    (m) => m.result === "DEFEATED",
  ).length;

  // Find key/controversial items
  const controversialItems = agendaItems.filter(
    (item) => item.is_controversial,
  );
  const itemsWithMotions = agendaItems.filter(
    (item) => item.motions && item.motions.length > 0,
  );

  // Find key decisions (non-procedural motions)
  const keyDecisions = agendaItems
    .filter((item) => item.category !== "Procedural")
    .flatMap((item) =>
      (item.motions || []).filter((m) => m.disposition !== "Procedural"),
    );

  return (
    <div
      className={cn(
        "bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden",
        className,
      )}
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-100">
        <h2 className="text-lg font-bold text-zinc-900">At a Glance</h2>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-zinc-100">
        {/* Duration - Click to Play */}
        <button
          onClick={onPlayVideo}
          className="p-5 text-left hover:bg-blue-50/50 transition-colors group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-blue-50 group-hover:bg-blue-100 transition-colors">
              <Clock className="h-4 w-4 text-blue-600" />
            </div>
            {onPlayVideo && (
              <Play className="h-4 w-4 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
          <div className="text-2xl font-bold text-zinc-900 mb-1">
            {formatDuration(durationSeconds)}
          </div>
          <div className="text-xs text-zinc-500">
            {onPlayVideo ? "Watch recording" : "Duration"}
          </div>
        </button>

        {/* Agenda Items - Click to scroll */}
        <button
          onClick={onScrollToAgenda}
          className="p-5 text-left hover:bg-emerald-50/50 transition-colors group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-emerald-50 group-hover:bg-emerald-100 transition-colors">
              <FileText className="h-4 w-4 text-emerald-600" />
            </div>
            {onScrollToAgenda && (
              <ChevronRight className="h-4 w-4 text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
          <div className="text-2xl font-bold text-zinc-900 mb-1">
            {agendaItems.length}
          </div>
          <div className="text-xs text-zinc-500">
            {controversialItems.length > 0
              ? `${controversialItems.length} notable item${controversialItems.length > 1 ? "s" : ""}`
              : "Agenda items"}
          </div>
        </button>

        {/* Motions - Click to scroll to agenda */}
        <button
          onClick={onScrollToAgenda}
          className="p-5 text-left hover:bg-amber-50/50 transition-colors group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-amber-50 group-hover:bg-amber-100 transition-colors">
              <Gavel className="h-4 w-4 text-amber-600" />
            </div>
            {onScrollToAgenda && (
              <ChevronRight className="h-4 w-4 text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
          <div className="text-2xl font-bold text-zinc-900 mb-1">
            {allMotions.length}
          </div>
          <div className="text-xs text-zinc-500">
            {allMotions.length > 0
              ? `${carriedCount} carried${defeatedCount > 0 ? `, ${defeatedCount} defeated` : ""}`
              : "No motions"}
          </div>
        </button>

        {/* Participants - Click to expand */}
        <button
          onClick={onScrollToParticipants}
          className="p-5 text-left hover:bg-violet-50/50 transition-colors group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-violet-50 group-hover:bg-violet-100 transition-colors">
              <Users className="h-4 w-4 text-violet-600" />
            </div>
            {onScrollToParticipants && (
              <ChevronRight className="h-4 w-4 text-violet-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
          <div className="text-2xl font-bold text-zinc-900 mb-1">
            {participantCount}
          </div>
          <div className="text-xs text-zinc-500">Participants</div>
        </button>
      </div>

      {/* Key Motions Preview */}
      {keyDecisions.length > 0 && (
        <div className="border-t border-zinc-100 px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Key Decisions
            </h3>
            {onScrollToAgenda && (
              <button
                onClick={onScrollToAgenda}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                View all
                <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="space-y-2">
            {keyDecisions.slice(0, 3).map((motion) => (
              <MotionPreview key={motion.id} motion={motion} />
            ))}
            {keyDecisions.length > 3 && (
              <div className="text-xs text-zinc-400 pt-1">
                +{keyDecisions.length - 3} more decision
                {keyDecisions.length - 3 > 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MotionPreview({ motion }: { motion: Motion }) {
  const summary = motion.plain_english_summary || motion.text_content;
  const truncated =
    summary.length > 80 ? summary.substring(0, 80) + "..." : summary;

  return (
    <div className="flex items-start gap-3 p-2 rounded-lg bg-zinc-50 border border-zinc-100">
      <div
        className={cn(
          "mt-0.5 w-2 h-2 rounded-full flex-shrink-0",
          motion.result === "CARRIED"
            ? "bg-green-500"
            : motion.result === "DEFEATED"
              ? "bg-red-500"
              : "bg-zinc-400",
        )}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-700 leading-snug">{truncated}</p>
        <div className="flex items-center gap-2 mt-1">
          <span
            className={cn(
              "text-[10px] font-bold uppercase",
              motion.result === "CARRIED"
                ? "text-green-600"
                : motion.result === "DEFEATED"
                  ? "text-red-600"
                  : "text-zinc-500",
            )}
          >
            {motion.result || "Pending"}
          </span>
          {motion.yes_votes > 0 && (
            <span className="text-[10px] text-zinc-400">
              ({motion.yes_votes}-{motion.no_votes})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
