import { Link } from "react-router";
import { Badge } from "../ui/badge";
import { cn, formatDate } from "../../lib/utils";
import type { KeyVote } from "../../lib/types";
import { AlertTriangle, Users, Calendar } from "lucide-react";

// ── Detection type labels ──

const DETECTION_LABELS: Record<string, string> = {
  minority: "Minority Vote",
  close_vote: "Close Vote",
  ally_break: "Broke Alignment",
};

// ── Component ──

interface KeyVoteCardProps {
  keyVote: KeyVote;
  personName?: string;
}

export function KeyVoteCard({ keyVote, personName }: KeyVoteCardProps) {
  const isYes = keyVote.vote.toLowerCase() === "yes";
  const isNo = keyVote.vote.toLowerCase() === "no";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3 shadow-sm hover:shadow-md transition-shadow">
      {/* Title + Vote badge */}
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-bold text-zinc-800 leading-snug flex-1">
          {keyVote.agenda_item_title || keyVote.motion_text?.slice(0, 120) || "Motion"}
        </h4>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] font-black uppercase px-2 py-0.5 shrink-0",
            isYes && "border-green-200 text-green-700 bg-green-50",
            isNo && "border-red-200 text-red-700 bg-red-50",
            !isYes && !isNo && "border-zinc-200 text-zinc-600 bg-zinc-50",
          )}
        >
          {keyVote.vote}
        </Badge>
      </div>

      {/* Context summary - the WHY */}
      {keyVote.context_summary && (
        <p className="text-sm text-zinc-600 leading-relaxed">
          {keyVote.context_summary}
        </p>
      )}

      {/* Motion text snippet (if different from title) */}
      {keyVote.motion_text && keyVote.agenda_item_title && (
        <p className="text-xs text-zinc-500 italic border-l-2 border-zinc-100 pl-3 leading-relaxed line-clamp-2">
          &ldquo;{keyVote.motion_text.slice(0, 200)}{keyVote.motion_text.length > 200 ? "..." : ""}&rdquo;
        </p>
      )}

      {/* Ally breaks */}
      {keyVote.ally_breaks && keyVote.ally_breaks.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-amber-700">
          <Users className="h-3 w-3 shrink-0" />
          <span className="font-medium">
            Broke from {keyVote.ally_breaks.map((a) => a.person_name.split(" ").pop()).join(", ")}
          </span>
        </div>
      )}

      {/* Footer: detection badges + vote split + meeting link */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {keyVote.detection_type.map((type) => (
            <Badge
              key={type}
              variant="outline"
              className="text-[9px] font-bold text-zinc-500 border-zinc-200 bg-zinc-50 px-1.5 py-0"
            >
              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
              {DETECTION_LABELS[type] || type}
            </Badge>
          ))}
          {keyVote.vote_split && (
            <Badge
              variant="outline"
              className="text-[9px] font-bold text-zinc-500 border-zinc-200 bg-zinc-50 px-1.5 py-0"
            >
              {keyVote.vote_split}
            </Badge>
          )}
        </div>

        {keyVote.meeting_id && keyVote.meeting_date && (
          <Link
            to={`/meetings/${keyVote.meeting_id}`}
            className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:underline shrink-0"
          >
            <Calendar className="h-3 w-3" />
            {formatDate(keyVote.meeting_date)}
          </Link>
        )}
      </div>
    </div>
  );
}
