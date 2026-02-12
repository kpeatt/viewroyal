import { Gavel, CheckCircle2, XCircle, AlertCircle, PlayCircle } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import type { Motion, Vote } from "../lib/types";

interface MotionCardProps {
  motion: Motion;
  timestamp?: number;
  showTimeline?: boolean;
  onWatchVideo?: (seconds: number) => void;
}

export function MotionCard({ motion, timestamp, showTimeline = false, onWatchVideo }: MotionCardProps) {
  const cardContent = (
    <div className="w-full p-6 rounded-2xl bg-amber-50 border-2 border-amber-200 shadow-sm text-amber-900">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">
            Formal Motion
          </span>
          {motion.result && (
            <Badge
              variant={motion.result === "CARRIED" ? "default" : "destructive"}
              className={cn(
                "h-5 text-[8px] px-1.5 font-black tracking-widest shadow-sm",
                motion.result === "CARRIED" ? "bg-green-600" : "bg-red-600",
              )}
            >
              {motion.result}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          {(timestamp !== undefined || motion.time_offset_seconds !== null) && (
            <time className="font-mono text-[10px] font-bold text-amber-500 bg-white px-2 py-0.5 rounded-full border border-amber-100 shadow-sm">
              {Math.floor((timestamp ?? (motion.time_offset_seconds || 0)) / 60)}:
              {((timestamp ?? (motion.time_offset_seconds || 0)) % 60).toFixed(0).padStart(2, "0")}
            </time>
          )}
          {onWatchVideo && motion.time_offset_seconds !== null && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 px-2 text-[10px] font-bold gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-100/50"
              onClick={() => onWatchVideo(motion.time_offset_seconds!)}
            >
              <PlayCircle className="h-3 w-3" />
              Watch
            </Button>
          )}
        </div>
      </div>

      <blockquote className="text-base font-bold leading-relaxed mb-4 border-l-4 border-amber-300 pl-4 py-1 italic">
        "{motion.text_content}"
      </blockquote>

      {motion.plain_english_summary && (
        <div className="mt-4 p-3 rounded-xl bg-white/50 border border-amber-100">
          <p className="text-[10px] text-amber-800 leading-relaxed font-semibold">
            <span className="opacity-50 uppercase mr-1">Simple Version:</span>{" "}
            {motion.plain_english_summary}
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
  );

  if (!showTimeline) {
    return cardContent;
  }

  // When used in MeetingFeed, wrap with timeline styling
  return (
    <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
      <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-amber-500 text-white shadow-lg shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-transform group-hover:scale-110">
        <Gavel className="h-5 w-5" />
      </div>
      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)]">
        {cardContent}
      </div>
    </div>
  );
}
