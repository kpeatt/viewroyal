import type { AgendaItem, TranscriptSegment, Motion } from "./types";

export interface AgendaTimeBlock {
  id: number;
  itemOrder: string;
  title: string;
  startTime: number;
  endTime: number;
  category?: string;
  isControversial?: boolean;
  motionCount: number;
  summary?: string;
}

export interface MotionMarker {
  id: number;
  agendaItemId: number;
  time: number;
  text: string;
  result?: string;
  mover?: string;
  seconder?: string;
}

export interface EmbeddedMotion {
  id: number;
  relativePosition: number; // 0-1, position within parent block
  time: number;
  result?: string;
  text: string;
  mover?: string;
  seconder?: string;
}

export interface AgendaBlockWithMotions extends AgendaTimeBlock {
  motions: EmbeddedMotion[];
}

export interface SpeakerSegment {
  id: number;
  speakerName: string;
  startTime: number;
  endTime: number;
  colorIndex: number;
}

/**
 * Extracts agenda time blocks from agenda items for timeline visualization
 */
export function getAgendaTimeBlocks(
  agendaItems: AgendaItem[],
): AgendaTimeBlock[] {
  return agendaItems
    .filter(
      (item) =>
        item.discussion_start_time !== null &&
        item.discussion_start_time !== undefined,
    )
    .map((item) => ({
      id: item.id,
      itemOrder: item.item_order || "",
      title: item.title,
      startTime: item.discussion_start_time!,
      endTime: item.discussion_end_time ?? item.discussion_start_time! + 60,
      category: item.category,
      isControversial: item.is_controversial,
      motionCount: item.motions?.length ?? 0,
    }))
    .sort((a, b) => a.startTime - b.startTime);
}

/**
 * Extracts agenda blocks with embedded motion markers for unified timeline visualization.
 * Motions are positioned relative to their parent block (0-1 range).
 */
export function getAgendaBlocksWithMotions(
  agendaItems: AgendaItem[],
): AgendaBlockWithMotions[] {
  return agendaItems
    .filter(
      (item) =>
        item.discussion_start_time !== null &&
        item.discussion_start_time !== undefined,
    )
    .map((item) => {
      const startTime = item.discussion_start_time!;
      const endTime = item.discussion_end_time ?? startTime + 60;
      const blockDuration = endTime - startTime;

      // Calculate relative positions for each motion within this block
      const embeddedMotions: EmbeddedMotion[] = (item.motions || [])
        .map((motion) => {
          const motionTime = motion.time_offset_seconds ?? startTime;
          // Clamp motion time to block boundaries
          const clampedTime = Math.max(
            startTime,
            Math.min(endTime, motionTime),
          );
          const relativePosition =
            blockDuration > 0 ? (clampedTime - startTime) / blockDuration : 0.5;

          return {
            id: motion.id,
            relativePosition,
            time: motionTime,
            result: motion.result,
            text: motion.text_content,
            mover: motion.mover_person?.name || motion.mover,
            seconder: motion.seconder_person?.name || motion.seconder,
          };
        })
        .sort((a, b) => a.relativePosition - b.relativePosition);

      return {
        id: item.id,
        itemOrder: item.item_order || "",
        title: item.title,
        startTime,
        endTime,
        category: item.category,
        isControversial: item.is_controversial,
        motionCount: embeddedMotions.length,
        summary: item.plain_english_summary || item.description || undefined,
        motions: embeddedMotions,
      };
    })
    .sort((a, b) => a.startTime - b.startTime);
}

/**
 * Extracts motion markers from agenda items for timeline visualization
 * @deprecated Use getAgendaBlocksWithMotions instead for unified visualization
 */
export function getMotionMarkers(agendaItems: AgendaItem[]): MotionMarker[] {
  const markers: MotionMarker[] = [];

  agendaItems.forEach((item) => {
    if (!item.motions) return;

    item.motions.forEach((motion: Motion) => {
      // Use motion's time_offset_seconds, or fall back to agenda item's discussion_start_time
      const time =
        motion.time_offset_seconds ?? item.discussion_start_time ?? null;

      if (time !== null) {
        markers.push({
          id: motion.id,
          agendaItemId: item.id,
          time,
          text: motion.text_content,
          result: motion.result,
          mover: motion.mover_person?.name || motion.mover,
          seconder: motion.seconder_person?.name || motion.seconder,
        });
      }
    });
  });

  return markers.sort((a, b) => a.time - b.time);
}

/**
 * Calculates total meeting duration from transcript
 */
export function getMeetingDuration(transcript: TranscriptSegment[]): number {
  if (transcript.length === 0) return 0;
  const lastSegment = transcript[transcript.length - 1];
  return lastSegment.end_time || 0;
}

/**
 * Finds the active agenda item for a given time
 */
export function findAgendaItemForTime(
  agendaItems: AgendaItem[],
  time: number,
): AgendaItem | undefined {
  return agendaItems.find(
    (item) =>
      item.discussion_start_time !== null &&
      item.discussion_start_time !== undefined &&
      item.discussion_end_time !== null &&
      item.discussion_end_time !== undefined &&
      time >= item.discussion_start_time &&
      time < item.discussion_end_time,
  );
}

/**
 * Finds the active transcript segment for a given time
 */
export function findTranscriptSegmentForTime(
  transcript: TranscriptSegment[],
  time: number,
): TranscriptSegment | undefined {
  return transcript.find((s) => time >= s.start_time && time < s.end_time);
}

/**
 * Generates a Vimeo URL with timestamp
 */
export function getVimeoTimeUrl(videoUrl: string, seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const timeStr = `${h > 0 ? h + "h" : ""}${m}m${s}s`;
  const baseUrl = videoUrl.split("#")[0];
  return `${baseUrl}#t=${timeStr}`;
}

/**
 * Formats seconds to MM:SS or HH:MM:SS
 */
export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Color palette for agenda blocks (distinct from speaker colors)
 */
export const AGENDA_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-indigo-500",
  "bg-lime-500",
  "bg-fuchsia-500",
];

export const AGENDA_COLORS_LIGHT = [
  "bg-blue-100",
  "bg-emerald-100",
  "bg-violet-100",
  "bg-amber-100",
  "bg-rose-100",
  "bg-cyan-100",
  "bg-orange-100",
  "bg-indigo-100",
  "bg-lime-100",
  "bg-fuchsia-100",
];

export const AGENDA_BORDER_COLORS = [
  "border-blue-500",
  "border-emerald-500",
  "border-violet-500",
  "border-amber-500",
  "border-rose-500",
  "border-cyan-500",
  "border-orange-500",
  "border-indigo-500",
  "border-lime-500",
  "border-fuchsia-500",
];

export const AGENDA_TEXT_COLORS = [
  "text-blue-700",
  "text-emerald-700",
  "text-violet-700",
  "text-amber-700",
  "text-rose-700",
  "text-cyan-700",
  "text-orange-700",
  "text-indigo-700",
  "text-lime-700",
  "text-fuchsia-700",
];

/**
 * Gets a consistent color index for an agenda item based on its position
 */
export function getAgendaColorIndex(index: number): number {
  return index % AGENDA_COLORS.length;
}
