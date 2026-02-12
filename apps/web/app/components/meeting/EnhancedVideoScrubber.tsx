import { useState, useMemo } from "react";
import { Gavel, MapPin, Mic } from "lucide-react";
import { cn } from "../../lib/utils";
import type { AgendaItem, TranscriptSegment } from "../../lib/types";
import {
  getAgendaBlocksWithMotions,
  formatTimestamp,
  AGENDA_COLORS,
  getAgendaColorIndex,
  type AgendaBlockWithMotions,
  type EmbeddedMotion,
} from "../../lib/timeline-utils";
import { getSpeakerColorIndex, SPEAKER_COLORS } from "../../lib/colors";

interface EnhancedVideoScrubberProps {
  duration: number;
  currentTime: number;
  agendaItems: AgendaItem[];
  transcript: TranscriptSegment[];
  onSeek: (time: number) => void;
  onAgendaClick: (itemId: number) => void;
  resolveSpeakerName: (seg: TranscriptSegment) => string;
  className?: string;
}

export function EnhancedVideoScrubber({
  duration,
  currentTime,
  agendaItems,
  transcript,
  onSeek,
  onAgendaClick,
  resolveSpeakerName,
  className,
}: EnhancedVideoScrubberProps) {
  const [hoveredItem, setHoveredItem] = useState<{
    type: "agenda" | "motion" | "speaker";
    label: string;
    subLabel?: string;
    detail?: string;
    time: number;
    x: number;
  } | null>(null);

  // Get agenda blocks with embedded motions
  const agendaBlocks = useMemo(
    () => getAgendaBlocksWithMotions(agendaItems),
    [agendaItems],
  );

  // Find active agenda block
  const activeAgendaBlock = useMemo(() => {
    return agendaBlocks.find(
      (block) => currentTime >= block.startTime && currentTime < block.endTime,
    );
  }, [agendaBlocks, currentTime]);

  // Find active transcript segment
  const activeSegment = useMemo(() => {
    return transcript.find(
      (seg) => currentTime >= seg.start_time && currentTime < seg.end_time,
    );
  }, [transcript, currentTime]);

  if (duration === 0) return null;

  const playheadPosition = (currentTime / duration) * 100;

  return (
    <div className={cn("bg-zinc-800 px-4 py-3", className)}>
      {/* Tooltip */}
      {hoveredItem && (
        <div
          className="absolute bottom-full mb-2 z-50 pointer-events-none"
          style={{
            left: `${Math.min(Math.max(hoveredItem.x, 10), 90)}%`,
            transform: "translateX(-50%)",
          }}
        >
          <div className="bg-zinc-900 text-white px-3 py-2 rounded-lg shadow-xl border border-zinc-700 text-sm max-w-xs">
            <div className="font-semibold">{hoveredItem.label}</div>
            {hoveredItem.subLabel && (
              <div className="text-zinc-400 text-xs">
                {hoveredItem.subLabel}
              </div>
            )}
            {hoveredItem.detail && (
              <div className="text-zinc-300 text-xs mt-1 line-clamp-3 leading-relaxed">
                {hoveredItem.detail}
              </div>
            )}
            <div className="text-zinc-500 text-xs mt-1">
              {formatTimestamp(hoveredItem.time)}
            </div>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-zinc-900" />
        </div>
      )}

      <div className="relative space-y-1.5">
        {/* Layer 1: Agenda Blocks with Embedded Motions */}
        <div className="relative h-8 rounded-lg overflow-hidden bg-zinc-700/50">
          {agendaBlocks.map((block, idx) => {
            const left = (block.startTime / duration) * 100;
            const width = ((block.endTime - block.startTime) / duration) * 100;
            const colorIdx = getAgendaColorIndex(idx);
            const isActive = activeAgendaBlock?.id === block.id;

            return (
              <AgendaBlock
                key={block.id}
                block={block}
                left={left}
                width={width}
                colorIdx={colorIdx}
                isActive={isActive}
                onSeek={onSeek}
                onAgendaClick={onAgendaClick}
                onHover={(item) => setHoveredItem(item)}
                onHoverEnd={() => setHoveredItem(null)}
              />
            );
          })}

          {/* Playhead */}
          <div
            className="absolute top-0 h-full w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)] z-20 pointer-events-none"
            style={{ left: `${playheadPosition}%` }}
          />
        </div>

        {/* Layer 2: Speaker Progress Bar */}
        <div
          className="relative h-3 rounded overflow-hidden bg-zinc-700/50 cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percent = x / rect.width;
            const time = percent * duration;
            onSeek(time);
          }}
        >
          {transcript.map((segment) => {
            const left = (segment.start_time / duration) * 100;
            const width =
              ((segment.end_time - segment.start_time) / duration) * 100;
            const speakerName = resolveSpeakerName(segment);
            const colorIdx = getSpeakerColorIndex(speakerName);
            const isActive =
              currentTime >= segment.start_time &&
              currentTime < segment.end_time;
            const isPlayed = currentTime >= segment.end_time;

            return (
              <div
                key={segment.id}
                className={cn(
                  "absolute top-0 h-full transition-opacity",
                  SPEAKER_COLORS[colorIdx],
                  isActive
                    ? "opacity-100"
                    : isPlayed
                      ? "opacity-60"
                      : "opacity-30",
                )}
                style={{
                  left: `${left}%`,
                  width: `${Math.max(width, 0.1)}%`,
                }}
                onMouseEnter={() =>
                  setHoveredItem({
                    type: "speaker",
                    label: speakerName,
                    detail:
                      segment.corrected_text_content || segment.text_content,
                    time: segment.start_time,
                    x: left + width / 2,
                  })
                }
                onMouseLeave={() => setHoveredItem(null)}
              />
            );
          })}

          {/* Progress overlay */}
          <div
            className="absolute top-0 h-full bg-white/5 pointer-events-none"
            style={{ width: `${playheadPosition}%` }}
          />

          {/* Playhead */}
          <div
            className="absolute top-0 h-full w-0.5 bg-white z-10 pointer-events-none"
            style={{ left: `${playheadPosition}%` }}
          />
        </div>
      </div>

      {/* Now Playing - Single Line */}
      <div className="mt-2 flex items-center justify-between text-xs text-zinc-400">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          {activeAgendaBlock && (
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin className="h-3 w-3 text-blue-400 shrink-0" />
              <span className="truncate">
                <span className="text-zinc-500">Item </span>
                <span className="text-white font-medium">
                  {activeAgendaBlock.itemOrder}
                </span>
                <span className="text-zinc-500">: </span>
                <span className="text-zinc-300">{activeAgendaBlock.title}</span>
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {activeSegment && (
            <div className="flex items-center gap-1.5">
              <Mic className="h-3 w-3 text-emerald-400" />
              <span className="text-white font-medium">
                {resolveSpeakerName(activeSegment)}
              </span>
            </div>
          )}
          <span className="text-zinc-500 font-mono text-[11px]">
            {formatTimestamp(currentTime)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Agenda block with embedded motion markers
function AgendaBlock({
  block,
  left,
  width,
  colorIdx,
  isActive,
  onSeek,
  onAgendaClick,
  onHover,
  onHoverEnd,
}: {
  block: AgendaBlockWithMotions;
  left: number;
  width: number;
  colorIdx: number;
  isActive: boolean;
  onSeek: (time: number) => void;
  onAgendaClick: (itemId: number) => void;
  onHover: (item: {
    type: "agenda" | "motion";
    label: string;
    subLabel?: string;
    detail?: string;
    time: number;
    x: number;
  }) => void;
  onHoverEnd: () => void;
}) {
  return (
    <div
      className={cn(
        "absolute top-0 h-full cursor-pointer transition-all group",
        AGENDA_COLORS[colorIdx],
        isActive
          ? "opacity-100 ring-2 ring-white ring-inset"
          : "opacity-50 hover:opacity-80",
      )}
      style={{
        left: `${left}%`,
        width: `${Math.max(width, 0.5)}%`,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onAgendaClick(block.id);
        onSeek(block.startTime);
      }}
      onMouseEnter={() =>
        onHover({
          type: "agenda",
          label: `${block.itemOrder}. ${block.title}`,
          subLabel:
            block.motions.length > 0
              ? `${block.motions.length} motion${block.motions.length > 1 ? "s" : ""}`
              : undefined,
          detail: block.summary,
          time: block.startTime,
          x: left + width / 2,
        })
      }
      onMouseLeave={onHoverEnd}
    >
      {/* Item order label - show if block is wide enough */}
      {width > 2.5 && (
        <span className="absolute top-0.5 left-1 text-[9px] font-bold text-white/70 leading-none">
          {block.itemOrder}
        </span>
      )}

      {/* Embedded Motion Markers */}
      {block.motions.map((motion) => (
        <MotionMarker
          key={motion.id}
          motion={motion}
          blockLeft={left}
          blockWidth={width}
          onSeek={onSeek}
          onHover={onHover}
          onHoverEnd={onHoverEnd}
        />
      ))}
    </div>
  );
}

// Motion marker embedded within agenda block
function MotionMarker({
  motion,
  blockLeft,
  blockWidth,
  onSeek,
  onHover,
  onHoverEnd,
}: {
  motion: EmbeddedMotion;
  blockLeft: number;
  blockWidth: number;
  onSeek: (time: number) => void;
  onHover: (item: {
    type: "motion";
    label: string;
    subLabel?: string;
    detail?: string;
    time: number;
    x: number;
  }) => void;
  onHoverEnd: () => void;
}) {
  // Position within the block (as percentage of block width)
  const positionInBlock = motion.relativePosition * 100;
  // Absolute position for tooltip
  const absoluteX = blockLeft + motion.relativePosition * blockWidth;

  const resultLabel =
    motion.result === "CARRIED"
      ? "Motion Carried"
      : motion.result === "DEFEATED"
        ? "Motion Defeated"
        : "Motion";

  const subLabel = [motion.mover, motion.seconder].filter(Boolean).join(" / ");

  return (
    <div
      className={cn(
        "absolute bottom-0.5 w-4 h-4 -ml-2 cursor-pointer z-10",
        "transition-transform hover:scale-125",
      )}
      style={{ left: `${positionInBlock}%` }}
      onClick={(e) => {
        e.stopPropagation();
        onSeek(motion.time);
      }}
      onMouseEnter={(e) => {
        e.stopPropagation();
        onHover({
          type: "motion",
          label: resultLabel,
          subLabel: subLabel || undefined,
          detail: motion.text || undefined,
          time: motion.time,
          x: absoluteX,
        });
      }}
      onMouseLeave={(e) => {
        e.stopPropagation();
        onHoverEnd();
      }}
    >
      <div
        className={cn(
          "w-full h-full rounded-full flex items-center justify-center",
          "shadow-md border border-white/30",
          motion.result === "CARRIED"
            ? "bg-green-500"
            : motion.result === "DEFEATED"
              ? "bg-red-500"
              : "bg-zinc-500",
        )}
      >
        <Gavel className="h-2 w-2 text-white" />
      </div>
    </div>
  );
}
