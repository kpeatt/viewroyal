import { Link } from "react-router";
import { Gavel, MessageSquare, FileText, Mic } from "lucide-react";
import { Badge } from "../ui/badge";
import { cn, formatDate } from "../../lib/utils";
import type { UnifiedSearchResult } from "../../services/hybrid-search.server";
import { MotionOutcomeBadge } from "../motion-outcome-badge";
import { trackEvent } from "../../lib/analytics";

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
// Type-specific URL resolution
// ---------------------------------------------------------------------------

function getResultUrl(result: UnifiedSearchResult): string {
  if (!result.meeting_id) return "#";

  switch (result.type) {
    case "motion":
    case "key_statement":
      // Link to meeting page anchored at the parent agenda item
      return result.agenda_item_id
        ? `/meetings/${result.meeting_id}#agenda-${result.agenda_item_id}`
        : `/meetings/${result.meeting_id}`;

    case "document_section":
      // Link to document viewer if we have the document ID, otherwise meeting page with agenda anchor
      if (result.document_id)
        return `/meetings/${result.meeting_id}/documents/${result.document_id}`;
      if (result.agenda_item_id)
        return `/meetings/${result.meeting_id}#agenda-${result.agenda_item_id}`;
      return `/meetings/${result.meeting_id}`;

    case "transcript_segment":
      // Link to meeting page at the specific timestamp
      return result.start_time
        ? `/meetings/${result.meeting_id}#t=${result.start_time}`
        : `/meetings/${result.meeting_id}`;

    default:
      return `/meetings/${result.meeting_id}`;
  }
}

// ---------------------------------------------------------------------------
// ResultCard component
// ---------------------------------------------------------------------------

interface ResultCardProps {
  result: UnifiedSearchResult;
  query: string;
  position?: number;
}

export function ResultCard({ result, query, position }: ResultCardProps) {
  const config = TYPE_CONFIG[result.type];
  const { Icon, iconColor, hoverBorder } = config;

  const linkTo = getResultUrl(result);

  return (
    <Link
      to={linkTo}
      onClick={() =>
        trackEvent("search result clicked", {
          result_type: result.type,
          result_position: position,
          meeting_id: result.meeting_id,
          destination: linkTo,
        })
      }
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
          <MotionOutcomeBadge result={result.motion_result} className="text-[10px] font-bold" />
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
