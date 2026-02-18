import { Link } from "react-router";
import { Gavel, MessageSquare, FileText, Mic } from "lucide-react";
import { Badge } from "../ui/badge";
import { cn, formatDate } from "../../lib/utils";
import type { UnifiedSearchResult } from "../../services/hybrid-search.server";

// ---------------------------------------------------------------------------
// Query highlighting
// ---------------------------------------------------------------------------

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;
  try {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = text.split(new RegExp(`(${escaped})`, "gi"));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark
              key={i}
              className="bg-amber-200 text-zinc-900 rounded-sm px-0.5 font-semibold"
            >
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </>
    );
  } catch {
    return <>{text}</>;
  }
}

// ---------------------------------------------------------------------------
// Type-specific card configurations
// ---------------------------------------------------------------------------

const TYPE_CONFIG = {
  motion: {
    Icon: Gavel,
    iconColor: "text-violet-600",
    hoverBorder: "hover:border-violet-200",
  },
  key_statement: {
    Icon: MessageSquare,
    iconColor: "text-emerald-600",
    hoverBorder: "hover:border-emerald-200",
  },
  document_section: {
    Icon: FileText,
    iconColor: "text-amber-500",
    hoverBorder: "hover:border-amber-200",
  },
  transcript_segment: {
    Icon: Mic,
    iconColor: "text-blue-600",
    hoverBorder: "hover:border-blue-200",
  },
} as const;

// ---------------------------------------------------------------------------
// ResultCard component
// ---------------------------------------------------------------------------

interface ResultCardProps {
  result: UnifiedSearchResult;
  query: string;
}

export function ResultCard({ result, query }: ResultCardProps) {
  const config = TYPE_CONFIG[result.type];
  const { Icon, iconColor, hoverBorder } = config;

  const linkTo = result.meeting_id
    ? result.type === "transcript_segment" && result.start_time
      ? `/meetings/${result.meeting_id}#t=${result.start_time}`
      : `/meetings/${result.meeting_id}`
    : "#";

  return (
    <Link
      to={linkTo}
      className={cn(
        "block p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-all group",
        hoverBorder,
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("h-4 w-4 shrink-0", iconColor)} />

        {/* Type-specific badges */}
        {result.type === "motion" && result.motion_result && (
          <Badge
            variant={result.motion_result === "CARRIED" ? "secondary" : "outline"}
            className={cn(
              "text-[10px] font-bold",
              result.motion_result === "CARRIED"
                ? "bg-green-100 text-green-700 hover:bg-green-100"
                : "text-zinc-500",
            )}
          >
            {result.motion_result}
          </Badge>
        )}

        {result.type === "key_statement" && result.statement_type && (
          <Badge variant="secondary" className="text-[10px] font-bold bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            {result.statement_type}
          </Badge>
        )}

        {/* Speaker name */}
        {result.speaker_name && (
          <span className="text-xs font-bold text-zinc-600">
            {result.speaker_name}
          </span>
        )}

        {/* Meeting date */}
        {result.meeting_date && (
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-auto">
            {formatDate(result.meeting_date)}
          </span>
        )}
      </div>

      {/* Title for document sections */}
      {result.type === "document_section" && result.title !== "Document Section" && (
        <h4 className="text-sm font-bold text-zinc-900 group-hover:text-amber-600 transition-colors mb-1">
          {result.title}
        </h4>
      )}

      {/* Content preview */}
      <p className="text-sm text-zinc-700 leading-relaxed line-clamp-3">
        <HighlightText text={result.content} query={query} />
      </p>

      {/* Motion mover/seconder */}
      {result.type === "motion" && (result.motion_mover || result.motion_seconder) && (
        <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
          {result.motion_mover && <span>Moved by: {result.motion_mover}</span>}
          {result.motion_seconder && (
            <span>Seconded by: {result.motion_seconder}</span>
          )}
        </div>
      )}

      {/* Transcript jump-to link */}
      {result.type === "transcript_segment" && result.start_time && (
        <div className="mt-2 text-[10px] font-bold text-blue-600 uppercase tracking-widest">
          Jump to moment
        </div>
      )}
    </Link>
  );
}
