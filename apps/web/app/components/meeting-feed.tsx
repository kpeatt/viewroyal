import { useMemo, useState } from "react";
import type { TranscriptSegment, AgendaItem, Person, Motion, Vote } from "../lib/types";
import { 
  User, 
  Gavel,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Filter,
  FileText,
  MessageSquare,
  CheckCircle2,
  XCircle,
  AlertCircle
} from "lucide-react";
import { Badge } from "./ui/badge";
import { IntelligenceSection } from "./intelligence-section";
import { 
  getSpeakerColorIndex, 
  SPEAKER_COLORS, 
  SPEAKER_BG_LIGHT_COLORS, 
  SPEAKER_TEXT_COLORS,
  SPEAKER_BORDER_COLORS 
} from "../lib/colors";
import { cn } from "../lib/utils";

type FeedTurn = { 
  speaker: string; 
  role: string | null; 
  segments: TranscriptSegment[]; 
  timestamp: number; 
  agenda_item_id: number | null; 
  motion_id: number | null 
};

type FeedItem = 
  | { type: 'agenda'; data: AgendaItem; timestamp: number }
  | { type: 'motion_group'; motion: Motion; turns: FeedTurn[]; timestamp: number }
  | { type: 'turn'; speaker: string; role: string | null; segments: TranscriptSegment[]; timestamp: number; agenda_item_id: number | null; motion_id: number | null };

interface MeetingFeedProps {
  transcript: (TranscriptSegment & { person?: Person })[];
  agendaItems: (AgendaItem & { motions?: (Motion & { mover_person?: Person; seconder_person?: Person; votes?: (Vote & { person?: Person })[] })[] })[];
  videoUrl?: string;
  speakerMap: Record<string, string>;
  resolveSpeakerName: (seg: { person?: { name: string } | null; speaker_name?: string | null }) => string;
  resolveSpeakerRole: (seg: { person?: Person | null; speaker_name?: string | null }) => string | null;
}

export function MeetingFeed({ transcript, agendaItems, videoUrl, resolveSpeakerName, resolveSpeakerRole }: MeetingFeedProps) {
  const [filterSpeaker, setFilterSpeaker] = useState<string | null>(null);

  const feedItems = useMemo(() => {
    // Helper to find which agenda item a timestamp belongs to
    const findAgendaItemForTime = (time: number) => {
      return agendaItems.find(item => 
        item.discussion_start_time !== null && 
        item.discussion_start_time !== undefined &&
        item.discussion_end_time !== null && 
        item.discussion_end_time !== undefined &&
        time >= item.discussion_start_time && 
        time < item.discussion_end_time
      );
    };

    // 1. Group transcript into raw turns
    const allTurns: { speaker: string; role: string | null; segments: TranscriptSegment[]; timestamp: number; agenda_item_id: number | null; motion_id: number | null }[] = [];
    
    transcript.forEach(seg => {
      const speaker = resolveSpeakerName(seg);
      const role = resolveSpeakerRole(seg);
      
      // Determine agenda item membership via time range fallback
      const resolvedAgendaItem = seg.agenda_item_id || findAgendaItemForTime(seg.start_time)?.id || null;
      
      const lastTurn = allTurns.length > 0 ? allTurns[allTurns.length - 1] : null;

      const isSameSpeaker = lastTurn && lastTurn.speaker === speaker;
      const isSameAgenda = lastTurn && lastTurn.agenda_item_id === resolvedAgendaItem;
      const isSameMotion = lastTurn && lastTurn.motion_id === seg.motion_id;

      if (lastTurn && isSameSpeaker && isSameAgenda && isSameMotion) {
        lastTurn.segments.push(seg);
      } else {
        allTurns.push({
          speaker,
          role,
          segments: [seg],
          timestamp: seg.start_time,
          agenda_item_id: resolvedAgendaItem,
          motion_id: seg.motion_id
        });
      }
    });

    // 2. Identify positions for agenda items and motions
    // We prefer the first transcript segment's time if linked, otherwise use the item's own start time
    const agendaPositions = new Map<number, number>();
    const motionPositions = new Map<number, number>();

    allTurns.forEach(turn => {
      if (turn.agenda_item_id && !agendaPositions.has(turn.agenda_item_id)) {
        agendaPositions.set(turn.agenda_item_id, turn.timestamp);
      }
      if (turn.motion_id && !motionPositions.has(turn.motion_id)) {
        motionPositions.set(turn.motion_id, turn.timestamp);
      }
    });

    // 3. Create initial list of events with enforced monotonicity
    const rawItems: (
      | { type: 'agenda'; data: AgendaItem; timestamp: number }
      | { type: 'motion'; data: Motion; timestamp: number }
      | { type: 'turn'; data: typeof allTurns[0]; timestamp: number }
    )[] = [];

    // Add all turns first
    allTurns.forEach(turn => {
      rawItems.push({ type: 'turn', data: turn, timestamp: turn.timestamp });
    });

    // Add agenda items and motions with sequence protection
    let lastAgendaTs = 0;
    
    agendaItems.forEach(agenda => {
      // Find the best timestamp for the agenda header
      let timestamp = agendaPositions.get(agenda.id) ?? agenda.discussion_start_time ?? 0;
      
      // Protection: Agenda header should not be earlier than previous agenda header
      if (timestamp < lastAgendaTs) {
        timestamp = lastAgendaTs + 0.001;
      }
      
      // Protection: If we have transcript turns for this item, the header shouldn't be 
      // significantly later than the first turn, but also not earlier than the last agenda's end.
      // For now, simple monotonicity is best.
      
      lastAgendaTs = timestamp;
      rawItems.push({ type: 'agenda', data: agenda, timestamp: timestamp - 0.001 });
      
      let lastMotionTs = timestamp;
      agenda.motions?.forEach(motion => {
        let motionTs = motionPositions.get(motion.id) ?? motion.time_offset_seconds ?? 0;
        
        // Protection: Motion must be after agenda header and after previous motion in same item
        if (motionTs < lastMotionTs) {
          motionTs = lastMotionTs + 0.0005;
        }
        
        lastMotionTs = motionTs;
        // Update lastAgendaTs so next agenda item stays after this motion
        if (motionTs > lastAgendaTs) lastAgendaTs = motionTs;
        
        rawItems.push({ type: 'motion', data: motion, timestamp: motionTs - 0.0005 });
      });
    });

    // 4. Sort everything chronologically
    const sortedRaw = rawItems.sort((a, b) => {
      if (Math.abs(a.timestamp - b.timestamp) < 0.0001) {
        const order = { agenda: 0, motion: 1, turn: 2 };
        return order[a.type as keyof typeof order] - order[b.type as keyof typeof order];
      }
      return a.timestamp - b.timestamp;
    });

    // 5. Final pass: Group turns into motion_groups
    const finalItems: FeedItem[] = [];
    let currentMotionGroup: Extract<FeedItem, { type: 'motion_group' }> | null = null;

    sortedRaw.forEach(item => {
      if (item.type === 'agenda') {
        currentMotionGroup = null;
        finalItems.push(item);
      } else if (item.type === 'motion') {
        currentMotionGroup = {
          type: 'motion_group',
          motion: item.data,
          turns: [],
          timestamp: item.timestamp
        };
        finalItems.push(currentMotionGroup);
      } else if (item.type === 'turn') {
        const turn = item.data;
        // If this turn belongs to the active motion group, add it there
        if (currentMotionGroup && turn.motion_id === currentMotionGroup.motion.id) {
          currentMotionGroup.turns.push(turn);
        } else {
          // If turn has a motion_id but we don't have a group (or it's a different one), 
          // we might want to start one or just show it as a standalone turn.
          // Usually, the motion event comes first in our sort.
          currentMotionGroup = null;
          finalItems.push({
            type: 'turn',
            ...turn
          });
        }
      }
    });

    return finalItems;
  }, [transcript, agendaItems, resolveSpeakerName, resolveSpeakerRole]);

  const speakers = useMemo(() => {
    const set = new Set<string>();
    transcript.forEach(t => set.add(resolveSpeakerName(t)));
    return Array.from(set).sort();
  }, [transcript, resolveSpeakerName]);

  const filteredItems = useMemo(() => {
    if (!filterSpeaker) return feedItems;
    return feedItems.filter(item => {
      if (item.type === 'agenda') return true;
      if (item.type === 'motion_group') {
        // Show motion group if ANY turn within it matches the speaker
        return item.turns.some((t: FeedTurn) => t.speaker === filterSpeaker);
      }
      return item.speaker === filterSpeaker;
    });
  }, [feedItems, filterSpeaker]);

  const getVimeoTimeUrl = (seconds: number) => {
    if (!videoUrl) return "#";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const timeStr = `${h > 0 ? h + 'h' : ''}${m}m${s}s`;
    return `${videoUrl}#t=${timeStr}`;
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-3 overflow-x-auto pb-4 no-scrollbar">
        <button
          onClick={() => setFilterSpeaker(null)}
          className={cn(
            "px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap border shadow-sm",
            !filterSpeaker 
              ? "bg-zinc-900 text-white border-zinc-900" 
              : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300"
          )}
        >
          All Activity
        </button>
        {speakers.map(speaker => {
          const colorIdx = getSpeakerColorIndex(speaker);
          const isActive = filterSpeaker === speaker;
          return (
            <button
              key={speaker}
              onClick={() => setFilterSpeaker(isActive ? null : speaker)}
              className={cn(
                "px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap border flex items-center gap-2 shadow-sm",
                isActive 
                  ? cn(SPEAKER_COLORS[colorIdx], "text-white border-transparent") 
                  : cn("bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300")
              )}
            >
              <div className={cn("w-2 h-2 rounded-full", isActive ? "bg-white" : SPEAKER_COLORS[colorIdx])} />
              {speaker}
            </button>
          );
        })}
      </div>

      {/* Feed */}
      <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-zinc-100 before:via-zinc-200 before:to-zinc-100">
        {filteredItems.map((item, idx) => {
          if (item.type === 'agenda') {
            return (
              <div key={`agenda-${item.data.id}`} className="sticky top-4 z-30 mb-12 relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-blue-600 text-white shadow-lg shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-2xl bg-blue-600 border-2 border-blue-500 shadow-xl backdrop-blur-md text-white">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] font-black text-blue-100 uppercase tracking-[0.2em]">
                      Item {item.data.item_order}
                    </span>
                    <time className="font-mono text-[10px] font-bold text-blue-200 bg-blue-700/50 px-2 py-0.5 rounded-full border border-blue-400/30">
                      {Math.floor(item.timestamp / 60)}:{(item.timestamp % 60).toFixed(0).padStart(2, '0')}
                    </time>
                  </div>
                  <h4 className="font-extrabold text-white text-lg leading-tight">{item.data.title}</h4>
                  {item.data.description && (
                    <p className="text-sm text-blue-50 mt-3 leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all">{item.data.description}</p>
                  )}
                    {item.data.plain_english_summary && (
                      <div className="mt-2 p-3 bg-blue-50/50 rounded-xl border border-blue-100/50 text-xs text-blue-900 leading-relaxed">
                        {item.data.plain_english_summary}
                      </div>
                    )}
                  {item.data.neighborhood && (
                    <Badge variant="outline" className="mt-4 bg-blue-700 text-white border-blue-400">
                      {item.data.neighborhood}
                    </Badge>
                  )}
                </div>
              </div>
            );
          }

          if (item.type === 'motion_group') {
            const { motion, turns } = item;
            return (
              <div key={`motion-group-${motion.id}`} className="space-y-4 relative">
                {/* Formal Motion Card */}
                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-amber-500 text-white shadow-lg shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-transform group-hover:scale-110">
                    <Gavel className="h-5 w-5" />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-2xl bg-amber-50 border-2 border-amber-200 shadow-sm text-amber-900">
                    <div className="flex items-center justify-between gap-4 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Formal Motion</span>
                        {motion.result && (
                          <Badge 
                            variant={motion.result === "CARRIED" ? "default" : "destructive"} 
                            className={cn(
                              "h-5 text-[8px] px-1.5 font-black tracking-widest shadow-sm",
                              motion.result === "CARRIED" ? "bg-green-600" : "bg-red-600"
                            )}
                          >
                            {motion.result}
                          </Badge>
                        )}
                      </div>
                      <time className="font-mono text-[10px] font-bold text-amber-500 bg-white px-2 py-0.5 rounded-full border border-amber-100 shadow-sm">
                        {Math.floor(item.timestamp / 60)}:{(item.timestamp % 60).toFixed(0).padStart(2, '0')}
                      </time>
                    </div>
                    
                    <blockquote className="text-base font-bold leading-relaxed mb-4 border-l-4 border-amber-300 pl-4 py-1 italic">
                      "{motion.text_content}"
                    </blockquote>

                    {motion.plain_english_summary && (
                      <div className="mt-4 p-3 rounded-xl bg-white/50 border border-amber-100">
                        <p className="text-[10px] text-amber-800 leading-relaxed font-semibold">
                          <span className="opacity-50 uppercase mr-1">Simple Version:</span> {motion.plain_english_summary}
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-4 mt-4 text-[10px] font-bold uppercase tracking-tighter text-amber-600/70">
                      {motion.mover && (
                        <div className="flex items-center gap-1.5 bg-white/40 px-2 py-1 rounded-md border border-amber-100/50">
                          <span className="opacity-50">Moved by:</span> {motion.mover}
                        </div>
                      )}
                      {motion.seconder && (
                        <div className="flex items-center gap-1.5 bg-white/40 px-2 py-1 rounded-md border border-amber-100/50">
                          <span className="opacity-50">Seconded by:</span> {motion.seconder}
                        </div>
                      )}
                    </div>

                    {motion.votes && motion.votes.length > 0 && (
                      <div className="mt-6 pt-4 border-t border-amber-200/50">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {motion.votes.map((vote: Vote) => (
                            <div 
                              key={vote.id}
                              className="flex items-center gap-2 p-1.5 rounded-lg bg-white/30 border border-amber-100/50"
                            >
                              {vote.vote === "Yes" ? (
                                <CheckCircle2 className="h-3 w-3 text-green-600" />
                              ) : vote.vote === "No" ? (
                                <XCircle className="h-3 w-3 text-red-600" />
                              ) : (
                                <AlertCircle className="h-3 w-3 text-zinc-400" />
                              )}
                              <span className="text-[10px] font-bold text-amber-900/70 truncate">
                                {vote.person?.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Motion Discussion Container */}
                {turns.length > 0 && (
                  <div className="space-y-4 pl-12 md:pl-0">
                    <div className="hidden md:block absolute left-1/2 top-[100px] bottom-8 w-px bg-amber-200 -translate-x-px" />
                    {turns.map((turn: FeedTurn, tIdx: number) => {
                      const colorIdx = getSpeakerColorIndex(turn.speaker);
                      return (
                        <div key={`motion-turn-${tIdx}`} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group/turn">
                          <div className={cn(
                            "flex items-center justify-center w-8 h-8 rounded-full border-2 border-white shadow-sm shrink-0 md:order-1 md:group-odd/turn:-translate-x-1/2 md:group-even/turn:translate-x-1/2 z-10 transition-all bg-amber-50 text-amber-600 border-amber-200"
                          )}>
                            <MessageSquare className="h-3 w-3" />
                          </div>
                          <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2rem)] p-4 rounded-xl transition-all duration-300 hover:shadow-md bg-zinc-50 border border-dashed border-amber-200 shadow-inner">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black uppercase tracking-wider text-amber-700">
                                  {turn.speaker}
                                </span>
                                <Badge variant="secondary" className="bg-amber-100/50 text-amber-600 border-amber-100/50 text-[7px] h-3.5 px-1 font-black uppercase tracking-tighter">
                                  Discussing Motion
                                </Badge>
                              </div>
                              <time className="font-mono text-[9px] font-bold text-zinc-400">
                                {Math.floor(turn.timestamp / 60)}:{(turn.timestamp % 60).toFixed(0).padStart(2, '0')}
                              </time>
                            </div>
                            <div className="space-y-3">
                              {turn.segments.map((seg: TranscriptSegment) => (
                                <a 
                                  key={seg.id} 
                                  href={getVimeoTimeUrl(seg.start_time)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group/seg block relative"
                                >
                                  <p className="text-sm leading-relaxed text-zinc-800 font-medium">
                                    {seg.text_content}
                                    <span className="inline-flex ml-2 opacity-0 group-hover/seg:opacity-100 transition-opacity">
                                      <ExternalLink className="h-2.5 w-2.5 text-blue-500" />
                                    </span>
                                  </p>
                                </a>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const colorIdx = getSpeakerColorIndex(item.speaker);
          
          return (
            <div key={`turn-${idx}`} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
              <div className={cn(
                "flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shadow-md shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg",
                cn(SPEAKER_COLORS[colorIdx], "text-white")
              )}>
                <User className="h-5 w-5" />
              </div>
              <div className={cn(
                "w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-2xl transition-all duration-300 hover:shadow-xl hover:-translate-y-1",
                "bg-white border shadow-sm", SPEAKER_BORDER_COLORS[colorIdx]
              )}>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className={cn(
                        "text-sm font-black uppercase tracking-wider", 
                        SPEAKER_TEXT_COLORS[colorIdx]
                      )}>
                        {item.speaker}
                      </span>
                      {item.role && (
                        <span className="text-[10px] font-bold text-zinc-400 leading-tight">
                          {item.role}
                        </span>
                      )}
                    </div>
                  </div>
                  <a 
                    href={getVimeoTimeUrl(item.timestamp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[10px] font-bold text-zinc-400 hover:text-blue-600 transition-colors flex items-center gap-1.5 bg-zinc-50 px-2 py-1 rounded-full border border-zinc-100"
                  >
                    {Math.floor(item.timestamp / 60)}:{(item.timestamp % 60).toFixed(0).padStart(2, '0')}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                
                <div className="space-y-4">
                  {item.segments.map((seg: TranscriptSegment) => (
                    <a 
                      key={seg.id} 
                      href={getVimeoTimeUrl(seg.start_time)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group/seg block relative p-2 -m-2 rounded-lg hover:bg-zinc-100 transition-colors"
                    >
                      <p className={cn(
                        "text-sm leading-relaxed",
                        "text-zinc-700"
                      )}>
                        {seg.text_content}
                        <span className="inline-flex ml-2 opacity-0 group-hover/seg:opacity-100 transition-opacity">
                          <ExternalLink className="h-3 w-3 text-blue-500" />
                        </span>
                      </p>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
