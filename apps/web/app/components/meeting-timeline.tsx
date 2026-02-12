import { useMemo, useState, useRef } from "react";
import type { TranscriptSegment, AgendaItem } from "../lib/types";
import { User, Gavel, Activity, ExternalLink, FileText } from "lucide-react";
import { Badge } from "./ui/badge";
import { cn } from "~/lib/utils";
import { formatTimestamp } from "../lib/timeline-utils";
import {
  getSpeakerColorIndex,
  SPEAKER_COLORS,
  SPEAKER_BG_LIGHT_COLORS,
  SPEAKER_BORDER_COLORS,
} from "../lib/colors";

interface SegmentInfo {
  id: number;
  text: string;
  start: number;
  end: number;
}

interface SpeechEvent {
  type: "speech";
  start: number;
  end: number;
  speaker: string;
  segments: SegmentInfo[];
  id: string;
}

interface MotionEvent {
  type: "motion";
  start: number;
  end: number;
  text: string;
  result?: string;
  id: string;
  votes?: any[];
}

interface AgendaEvent {
  type: "agenda";
  start: number;
  end: number;
  title: string;
  item_order?: string;
  id: string;
  debate_summary?: string;
  key_quotes?: any[];
  category?: string;
}

type TimelineEvent = SpeechEvent | MotionEvent | AgendaEvent;

interface MeetingTimelineProps {
  transcript: TranscriptSegment[];
  agendaItems: AgendaItem[];
  videoUrl?: string;
  onSegmentHover?: (segmentId: number | null) => void;
  activeSegmentId?: number | null;
  speakerMap?: Record<string, string>;
}

const SPEAKER_HOVER_COLORS = [
  // ... existing SPEAKER_HOVER_COLORS ...
  "hover:bg-blue-200/60",
  "hover:bg-emerald-200/60",
  "hover:bg-violet-200/60",
  "hover:bg-amber-200/60",
  "hover:bg-rose-200/60",
  "hover:bg-cyan-200/60",
  "hover:bg-orange-200/60",
  "hover:bg-indigo-200/60",
  "hover:bg-lime-200/60",
  "hover:bg-fuchsia-200/60",
];

export function MeetingTimeline({
  transcript,
  agendaItems,
  videoUrl,
  onSegmentHover,
  activeSegmentId,
  speakerMap,
}: MeetingTimelineProps) {
  const [hoveredEvent, setHoveredEvent] = useState<TimelineEvent | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<SegmentInfo | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const events = useMemo(() => {
    const speechEvents: SpeechEvent[] = [];
    const motionEvents: MotionEvent[] = [];
    const agendaEvents: AgendaEvent[] = [];

    // Heuristic: Map agenda items and motions to transcript times if meta is missing
    const agendaPositions = new Map<number, number>();
    const motionPositions = new Map<number, number>();

    // Helper to find which agenda item a timestamp belongs to
    const findAgendaItemForTime = (time: number) => {
      return agendaItems.find(
        (item) =>
          item.discussion_start_time !== null &&
          item.discussion_start_time !== undefined &&
          item.discussion_end_time !== null &&
          item.discussion_end_time !== undefined &&
          time >= item.discussion_start_time &&
          time < item.discussion_end_time,
      );
    };

    transcript.forEach((segment) => {
      const resolvedAgendaItemId =
        segment.agenda_item_id ||
        findAgendaItemForTime(segment.start_time)?.id ||
        null;

      if (resolvedAgendaItemId && !agendaPositions.has(resolvedAgendaItemId)) {
        agendaPositions.set(resolvedAgendaItemId, segment.start_time);
      }
      if (segment.motion_id && !motionPositions.has(segment.motion_id)) {
        motionPositions.set(segment.motion_id, segment.start_time);
      }

      let speaker =
        segment.person?.name || segment.speaker_name || "Unknown Speaker";

      if (!segment.person?.name && segment.speaker_name && speakerMap) {
        const label = segment.speaker_name;
        const normalized = label.toUpperCase().replace(/\s+/g, "_");
        speaker =
          speakerMap[normalized] || speakerMap[label.toUpperCase()] || label;
      }

      const lastSpeech = speechEvents[speechEvents.length - 1];

      // Merge into a "turn" if same speaker and close in time
      if (
        lastSpeech &&
        lastSpeech.speaker === speaker &&
        segment.start_time - lastSpeech.end < 10
      ) {
        lastSpeech.end = segment.end_time;
        lastSpeech.segments.push({
          id: segment.id,
          text: segment.text_content,
          start: segment.start_time,
          end: segment.end_time,
        });
      } else {
        speechEvents.push({
          type: "speech",
          start: segment.start_time,
          end: segment.end_time,
          speaker: speaker,
          segments: [
            {
              id: segment.id,
              text: segment.text_content,
              start: segment.start_time,
              end: segment.end_time,
            },
          ],
          id: `speech-turn-${segment.id}`,
        });
      }
    });

    agendaItems.forEach((item) => {
      // Use discussion_start_time, then transcript-based position, then 0
      const agendaStartTime =
        item.discussion_start_time ?? agendaPositions.get(item.id);
      const agendaEndTime =
        item.discussion_end_time ??
        (agendaStartTime ? agendaStartTime + 10 : undefined);

      if (agendaStartTime !== undefined) {
        agendaEvents.push({
          type: "agenda",
          start: agendaStartTime,
          end: agendaEndTime ?? agendaStartTime + 10,
          title: item.title,
          item_order: item.item_order,
          id: `agenda-${item.id}`,
          debate_summary: item.debate_summary,
          key_quotes: (item.meta as any)?.key_quotes,
          category: item.category,
        });
      }

      item.motions?.forEach((motion) => {
        const startTime =
          motion.time_offset_seconds ?? motionPositions.get(motion.id);
        if (startTime !== undefined) {
          motionEvents.push({
            type: "motion",
            start: startTime,
            end: startTime + 5,
            text: motion.text_content,
            result: motion.result,
            id: `motion-${motion.id}`,
            votes: motion.votes,
          });
        }
      });
    });

    return {
      speech: speechEvents,
      motions: motionEvents,
      agenda: agendaEvents,
      all: [...speechEvents, ...motionEvents, ...agendaEvents].sort(
        (a, b) => a.start - b.start,
      ),
    };
  }, [transcript, agendaItems, speakerMap]);

  const totalDuration = useMemo(() => {
    const all = events.all;
    if (all.length === 0) return 1;
    return Math.max(...all.map((e) => e.end)) + 60; // Add buffer
  }, [events]);

  const getVimeoTimeUrl = (seconds: number) => {
    if (!videoUrl) return "#";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const timeStr = `${h > 0 ? h + "h" : ""}${m}m${s}s`;
    return `${videoUrl}#t=${timeStr}`;
  };

  // Group events into rows to prevent overlap
  const rows: SpeechEvent[][] = [[]];
  events.speech.forEach((event) => {
    let placed = false;
    for (let i = 0; i < rows.length; i++) {
      const lastInRow = rows[i][rows[i].length - 1];
      if (!lastInRow || event.start >= lastInRow.end) {
        rows[i].push(event);
        placed = true;
        break;
      }
    }
    if (!placed) rows.push([event]);
  });

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-zinc-200">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-600" />
          <h2 className="text-xl font-bold">Meeting Pulse</h2>
        </div>
        <div className="text-[10px] font-mono text-zinc-400 bg-zinc-50 px-2 py-1 rounded border border-zinc-100">
          {Math.floor(totalDuration / 60)}m Total Duration
        </div>
      </div>

      <div className="relative w-full py-8 group/timeline" ref={containerRef}>
        {/* Floating Tooltip */}
        {hoveredEvent && (
          <div
            className="absolute z-50 pointer-events-none transition-all duration-75 ease-out bottom-full mb-2"
            style={{
              left: `${
                hoveredEvent.type === "speech"
                  ? ((hoveredSegment
                      ? (hoveredSegment.start + hoveredSegment.end) / 2
                      : (hoveredEvent.start + hoveredEvent.end) / 2) /
                      totalDuration) *
                    100
                  : (hoveredEvent.start / totalDuration) * 100
              }%`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="bg-zinc-900/90 backdrop-blur text-white px-3 py-2 rounded-lg shadow-xl border border-white/10 text-xs w-64">
              {/* Header */}
              <div className="font-bold flex items-center gap-1.5 mb-1 pb-1 border-b border-white/10">
                {hoveredEvent.type === "motion" && (
                  <Gavel className="w-3 h-3 text-amber-400" />
                )}
                {hoveredEvent.type === "agenda" && (
                  <FileText className="w-3 h-3 text-blue-400" />
                )}
                {hoveredEvent.type === "speech" && (
                  <User className="w-3 h-3 text-emerald-400" />
                )}
                <span className="truncate">
                  {hoveredEvent.type === "motion"
                    ? "Council Motion"
                    : hoveredEvent.type === "agenda"
                      ? `Agenda Item ${hoveredEvent.item_order}`
                      : hoveredEvent.speaker}
                </span>
              </div>

              {/* Content */}
              <div className="py-1 min-h-[2.5rem]">
                {hoveredEvent.type === "speech" && hoveredSegment && (
                  <p className="text-zinc-200 leading-snug italic line-clamp-3">
                    "{hoveredSegment.text}"
                  </p>
                )}
                {hoveredEvent.type === "agenda" && (
                  <p className="text-zinc-200 leading-snug font-medium line-clamp-3">
                    {hoveredEvent.title}
                  </p>
                )}
                {hoveredEvent.type === "motion" && (
                  <p className="text-zinc-200 leading-snug font-medium line-clamp-3">
                    {hoveredEvent.text}
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="text-zinc-400 font-mono mt-1 pt-1 border-t border-white/10 flex justify-between items-center">
                <span>
                  {hoveredSegment ? (
                    <>
                      {formatTimestamp(hoveredSegment.start)} -{" "}
                      {formatTimestamp(hoveredSegment.end)}
                    </>
                  ) : (
                    <>
                      {formatTimestamp(hoveredEvent.start)}
                      {hoveredEvent.type === "speech" &&
                        ` - ${formatTimestamp(hoveredEvent.end)}`}
                    </>
                  )}
                </span>
                {hoveredEvent.type === "motion" && (
                  <span
                    className={cn(
                      "text-[10px] uppercase font-bold tracking-wider",
                      hoveredEvent.result === "CARRIED"
                        ? "text-emerald-400"
                        : hoveredEvent.result === "DEFEATED"
                          ? "text-rose-400"
                          : "text-zinc-400",
                    )}
                  >
                    {hoveredEvent.result || "VOTE"}
                  </span>
                )}
              </div>
            </div>
            {/* Arrow */}
            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-zinc-900/90" />
          </div>
        )}

        {/* Time markers */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
          {[0, 0.25, 0.5, 0.75, 1].map((percent) => (
            <div
              key={percent}
              className="absolute top-0 h-full border-l border-zinc-100"
              style={{ left: `${percent * 100}%` }}
            >
              <span className="absolute -top-7 -left-3 text-[9px] font-mono text-zinc-300">
                {Math.floor((percent * totalDuration) / 60)}m
              </span>
            </div>
          ))}
        </div>

        {/* Agenda Markers */}
        <div className="absolute top-0 left-0 w-full pointer-events-none -mt-6">
          {events.agenda.map((agenda) => (
            <div
              key={agenda.id}
              className="absolute top-0 h-6 w-6 -ml-3 pointer-events-auto cursor-help z-20 group/agenda"
              style={{ left: `${(agenda.start / totalDuration) * 100}%` }}
              onMouseEnter={() => setHoveredEvent(agenda)}
              onMouseLeave={() => setHoveredEvent(null)}
            >
              <div className="bg-blue-600 rounded-lg h-full w-full flex items-center justify-center shadow-lg ring-4 ring-white transition-transform group-hover/agenda:scale-125">
                <FileText className="h-3 w-3 text-white" />
              </div>
            </div>
          ))}
        </div>

        {/* Speech Tracks */}
        <div className="space-y-2 relative">
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="relative h-8 w-full">
              {row.map((turn) => {
                const colorIdx = getSpeakerColorIndex(turn.speaker);
                const turnLeft = (turn.start / totalDuration) * 100;
                const turnWidth =
                  ((turn.end - turn.start) / totalDuration) * 100;

                return (
                  <div
                    key={turn.id}
                    className={cn(
                      "absolute top-0 h-full rounded-md overflow-hidden flex transition-opacity border border-transparent",
                      SPEAKER_BG_LIGHT_COLORS[colorIdx],
                      "bg-opacity-40",
                      hoveredEvent && hoveredEvent.id !== turn.id
                        ? "opacity-40"
                        : "opacity-100",
                    )}
                    style={{
                      left: `${turnLeft}%`,
                      width: `${Math.max(turnWidth, 0.2)}%`,
                    }}
                    onMouseEnter={() => setHoveredEvent(turn)}
                    onMouseLeave={() => {
                      setHoveredEvent(null);
                      setHoveredSegment(null);
                      if (onSegmentHover) onSegmentHover(null);
                    }}
                  >
                    {turn.segments.map((seg) => (
                      <div
                        key={seg.id}
                        className={cn(
                          "h-full transition-colors relative group/seg cursor-crosshair border-r border-white/20 last:border-r-0",
                          activeSegmentId === seg.id
                            ? "bg-white/40 ring-1 ring-inset ring-white"
                            : SPEAKER_HOVER_COLORS[colorIdx],
                        )}
                        style={{
                          width: `${((seg.end - seg.start) / (turn.end - turn.start)) * 100}%`,
                          minWidth: "2px",
                        }}
                        onMouseEnter={(e) => {
                          e.stopPropagation();
                          setHoveredSegment(seg);
                          if (onSegmentHover) onSegmentHover(seg.id);
                        }}
                      >
                        {/* Speaker Indicator inside turn */}
                        <div
                          className={cn(
                            "absolute left-0 top-0 w-[2px] h-full opacity-30",
                            SPEAKER_COLORS[colorIdx],
                          )}
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Motion Markers */}
        <div className="absolute top-0 left-0 w-full pointer-events-none mt-2">
          {events.motions.map((motion) => (
            <div
              key={motion.id}
              className="absolute top-0 h-6 w-6 -ml-3 pointer-events-auto cursor-help z-20 group/motion"
              style={{ left: `${(motion.start / totalDuration) * 100}%` }}
              onMouseEnter={() => setHoveredEvent(motion)}
              onMouseLeave={() => setHoveredEvent(null)}
            >
              <div className="bg-amber-500 rounded-full h-full w-full flex items-center justify-center shadow-lg ring-4 ring-white transition-transform group-hover/motion:scale-125">
                <Gavel className="h-3 w-3 text-white" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dynamic Detail Panel */}
      <div className="mt-8 p-5 bg-zinc-50 rounded-2xl border border-zinc-200 min-h-[100px] relative overflow-hidden">
        {hoveredEvent ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "p-2 rounded-xl shadow-sm",
                    hoveredEvent.type === "motion"
                      ? "bg-amber-500 text-white"
                      : hoveredEvent.type === "agenda"
                        ? "bg-blue-600 text-white"
                        : SPEAKER_COLORS[
                            getSpeakerColorIndex(hoveredEvent.speaker)
                          ] + " text-white",
                  )}
                >
                  {hoveredEvent.type === "motion" ? (
                    <Gavel className="h-5 w-5" />
                  ) : hoveredEvent.type === "agenda" ? (
                    <FileText className="h-5 w-5" />
                  ) : (
                    <User className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900 leading-tight">
                    {hoveredEvent.type === "motion"
                      ? "Council Motion"
                      : hoveredEvent.type === "agenda"
                        ? `Item ${hoveredEvent.item_order}: ${hoveredEvent.title}`
                        : hoveredEvent.speaker}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono text-zinc-400 bg-white px-1.5 py-0.5 rounded border border-zinc-100">
                      {hoveredEvent.type === "speech" && hoveredSegment ? (
                        <>
                          {Math.floor(hoveredSegment.start / 60)}:
                          {(hoveredSegment.start % 60)
                            .toFixed(0)
                            .padStart(2, "0")}
                          {" - "}
                          {Math.floor(hoveredSegment.end / 60)}:
                          {(hoveredSegment.end % 60)
                            .toFixed(0)
                            .padStart(2, "0")}
                        </>
                      ) : (
                        <>
                          {Math.floor(hoveredEvent.start / 60)}:
                          {(hoveredEvent.start % 60)
                            .toFixed(0)
                            .padStart(2, "0")}
                          {" - "}
                          {Math.floor(hoveredEvent.end / 60)}:
                          {(hoveredEvent.end % 60).toFixed(0).padStart(2, "0")}
                        </>
                      )}
                    </span>
                    {hoveredEvent.type === "motion" && hoveredEvent.result && (
                      <Badge
                        variant={
                          hoveredEvent.result === "CARRIED"
                            ? "default"
                            : "destructive"
                        }
                        className="h-5 text-[10px]"
                      >
                        {hoveredEvent.result}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {hoveredEvent.type === "speech" && (
                  <div className="text-[10px] text-zinc-400 font-medium bg-zinc-100 px-2 py-1 rounded-full">
                    {hoveredEvent.segments.length} segments in turn
                  </div>
                )}
                <a
                  href={getVimeoTimeUrl(
                    hoveredSegment?.start || hoveredEvent.start,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-white border border-blue-100 px-3 py-1.5 rounded-lg shadow-sm transition-all"
                >
                  Watch
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            {hoveredEvent.type === "motion" && (
              <div className="mt-4 space-y-4 max-h-48 overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-zinc-200">
                <p className="text-sm text-zinc-800 font-medium leading-relaxed bg-white p-3 rounded-xl border border-zinc-100 shadow-sm">
                  {hoveredEvent.text}
                </p>
                {hoveredEvent.votes && hoveredEvent.votes.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">
                      Voting Record
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {hoveredEvent.votes.map((v: any, vIdx: number) => (
                        <div
                          key={vIdx}
                          className="flex items-center gap-2 bg-white px-2 py-1.5 rounded-lg border border-zinc-100 text-[10px] font-medium shadow-sm"
                        >
                          {v.vote === "Yes" ? (
                            <div className="w-2 h-2 rounded-full bg-green-500" />
                          ) : v.vote === "No" ? (
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-zinc-300" />
                          )}
                          <span className="text-zinc-700 truncate">
                            {v.person?.name}
                          </span>
                          <span
                            className={cn(
                              "ml-auto font-bold uppercase text-[8px]",
                              v.vote === "Yes"
                                ? "text-green-600"
                                : v.vote === "No"
                                  ? "text-red-600"
                                  : "text-zinc-400",
                            )}
                          >
                            {v.vote}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {hoveredEvent.type === "agenda" && (
              <div className="mt-4 space-y-4 max-h-48 overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-zinc-200">
                {hoveredEvent.category && (
                  <Badge
                    variant="outline"
                    className="bg-blue-50 text-blue-700 border-blue-100"
                  >
                    {hoveredEvent.category}
                  </Badge>
                )}
                {hoveredEvent.debate_summary && (
                  <div>
                    <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">
                      Debate Summary
                    </h4>
                    <p className="text-sm text-zinc-700 leading-relaxed">
                      {hoveredEvent.debate_summary}
                    </p>
                  </div>
                )}
                {hoveredEvent.key_quotes &&
                  hoveredEvent.key_quotes.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">
                        Key Quotes
                      </h4>
                      <div className="space-y-2">
                        {hoveredEvent.key_quotes.map((quote, qIdx) => (
                          <div
                            key={qIdx}
                            className="bg-white p-3 rounded-xl border border-zinc-100 shadow-sm italic text-xs text-zinc-600 border-l-4 border-l-blue-400"
                          >
                            "{quote.text}"
                            <div className="mt-1.5 not-italic font-bold text-blue-600 text-[10px]">
                              — {quote.speaker}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-400">
            <Activity className="h-8 w-8 opacity-20" />
            <p className="text-sm italic">
              Hover over the timeline to scroll the transcript
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
