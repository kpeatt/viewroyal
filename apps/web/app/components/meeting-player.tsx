import { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from "react";
import Player from "@vimeo/player";
import { PlayCircle, Clock, ChevronDown, ChevronUp, LayoutPanelTop } from "lucide-react";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";
import type { AgendaItem } from "../lib/types";

interface MeetingPlayerProps {
  videoUrl: string;
  agendaItems: AgendaItem[];
  onTimeUpdate?: (seconds: number) => void;
}

export interface MeetingPlayerHandle {
  seekTo: (seconds: number) => void;
}

export const MeetingPlayer = forwardRef<MeetingPlayerHandle, MeetingPlayerProps>(
  ({ videoUrl, agendaItems, onTimeUpdate }, ref) => {
    const [currentTime, setCurrentTime] = useState(0);
    const [player, setPlayer] = useState<Player | null>(null);
    const [isExpanded, setIsExpanded] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        if (player) {
          player.setCurrentTime(seconds);
          player.play();
        }
      },
    }));

        useEffect(() => {
          if (!containerRef.current) return;
    
          const vimeoPlayer = new Player(containerRef.current, {
            url: videoUrl as any,
            responsive: true,
            autoplay: false,
          });
    
          vimeoPlayer.on("timeupdate", (data) => {
            setCurrentTime(data.seconds);
            if (onTimeUpdate) onTimeUpdate(data.seconds);
          });
    
          setPlayer(vimeoPlayer);
    
          return () => {
            vimeoPlayer.destroy();
          };
        }, [videoUrl]);
    
        const activeItem = useMemo(() => {
          return agendaItems.find(item => 
            item.discussion_start_time !== null && 
            item.discussion_start_time !== undefined &&
            item.discussion_end_time !== null && 
            item.discussion_end_time !== undefined &&
            currentTime >= item.discussion_start_time && 
            currentTime < item.discussion_end_time
          );
        }, [currentTime, agendaItems]);
      return (
    <div className="space-y-4">
      {/* Video Container */}
      <div className="bg-black rounded-2xl overflow-hidden shadow-2xl aspect-video border-4 border-zinc-900">
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* Toggleable Agenda Overlay */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border shadow-sm overflow-hidden">
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          <div className="flex items-center gap-2">
            <LayoutPanelTop className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-black uppercase tracking-widest text-zinc-500">
              Live Agenda Tracking
            </span>
          </div>
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {isExpanded && (
          <div className="px-4 pb-4 pt-0 animate-in slide-in-from-top-1 duration-200">
            {activeItem ? (
              <div className="flex items-start gap-4 p-3 rounded-lg bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
                <Badge className="bg-blue-600 shrink-0 mt-0.5">
                  Item {activeItem.item_order}
                </Badge>
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-50 leading-tight">
                    {activeItem.title}
                  </h4>
                  {activeItem.category && (
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-tighter">
                      {activeItem.category}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center p-6 text-zinc-400 italic text-sm gap-2">
                <Clock className="h-4 w-4 opacity-50" />
                No specific item being discussed at this timestamp
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
