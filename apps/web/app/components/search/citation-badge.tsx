import { Link } from "react-router";
import {
  FileText,
  Mic,
  Gavel,
  MessageSquare,
  ExternalLink,
  Book,
} from "lucide-react";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "../ui/hover-card";

// ---------------------------------------------------------------------------
// Source type helpers
// ---------------------------------------------------------------------------

export const SOURCE_TYPE_LABEL: Record<string, string> = {
  transcript: "Transcript",
  transcript_segment: "Transcript",
  motion: "Motion",
  vote: "Vote",
  matter: "Matter",
  agenda_item: "Agenda Item",
  document_section: "Document",
  key_statement: "Statement",
  bylaw: "Bylaw",
};

export function SourceIcon({
  type,
  className,
}: {
  type?: string;
  className?: string;
}) {
  const cls = className || "h-3 w-3 text-zinc-400";
  if (type === "transcript" || type === "transcript_segment")
    return <Mic className={cls} />;
  if (type === "motion" || type === "vote") return <Gavel className={cls} />;
  if (type === "document_section") return <FileText className={cls} />;
  if (type === "key_statement") return <MessageSquare className={cls} />;
  if (type === "bylaw") return <Book className={cls} />;
  return <FileText className={cls} />;
}

// ---------------------------------------------------------------------------
// Citation token types
// ---------------------------------------------------------------------------

export type CitationToken =
  | { type: "text"; text: string }
  | { type: "single"; num: number; source: any }
  | { type: "group"; nums: number[]; sources: any[] };

// ---------------------------------------------------------------------------
// CitationBadge component (single numbered circle)
// ---------------------------------------------------------------------------

export function CitationBadge({
  num,
  source,
}: {
  num: number;
  source: any;
}) {
  const label = SOURCE_TYPE_LABEL[source?.type] || "Source";
  const link =
    source?.type === "bylaw" && source?.bylaw_id
      ? `/bylaws/${source.bylaw_id}`
      : source?.meeting_id
        ? `/meetings/${source.meeting_id}`
        : "#";

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <Link
          to={link}
          className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold leading-none !no-underline hover:!no-underline hover:bg-blue-200 transition-colors align-super ml-0.5 cursor-pointer"
        >
          {num}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="center" className="w-72 p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <SourceIcon
            type={source?.type}
            className="h-3.5 w-3.5 text-zinc-400"
          />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            {label}
          </span>
          {source?.meeting_date && (
            <span className="text-[10px] text-zinc-400 ml-auto">
              {source.meeting_date}
            </span>
          )}
        </div>
        {source?.speaker_name && (
          <p className="text-xs font-semibold text-zinc-700 mb-0.5">
            {source.speaker_name}
          </p>
        )}
        <p className="text-xs text-zinc-600 line-clamp-3">
          {source?.title || "View source"}
        </p>
        <Link
          to={link}
          className="flex items-center gap-1 mt-2 text-[10px] font-medium text-blue-600 hover:text-blue-700 no-underline"
        >
          {source?.type === "bylaw" ? "View bylaw" : "View in meeting"} <ExternalLink className="h-2.5 w-2.5" />
        </Link>
      </HoverCardContent>
    </HoverCard>
  );
}

// ---------------------------------------------------------------------------
// GroupedCitationBadge component (pill showing source count)
// Preview card content will be added in Plan 02.
// ---------------------------------------------------------------------------

export function GroupedCitationBadge({
  nums,
  sources,
}: {
  nums: number[];
  sources: any[];
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold leading-none align-super ml-0.5 cursor-pointer hover:bg-blue-200 transition-colors"
    >
      {sources.length} sources
    </button>
  );
}

// ---------------------------------------------------------------------------
// Citation grouping algorithm (pure function, testable)
// ---------------------------------------------------------------------------

/**
 * Groups consecutive citation tokens from a split text array.
 * Adjacent [N] patterns (no text between them) become a single group.
 * Single citations remain individual. Text fragments pass through.
 */
export function groupCitationParts(
  parts: string[],
  sources: any[],
): CitationToken[] {
  const tokens: CitationToken[] = [];
  let currentGroup: number[] = [];

  for (const part of parts) {
    const m = part.match(/^\[(\d+)\]$/);
    if (m) {
      currentGroup.push(parseInt(m[1], 10));
    } else {
      // Flush current group
      flushGroup(currentGroup, sources, tokens);
      currentGroup = [];
      if (part !== "") tokens.push({ type: "text", text: part });
    }
  }
  // Flush remaining group
  flushGroup(currentGroup, sources, tokens);

  return tokens;
}

function flushGroup(
  group: number[],
  sources: any[],
  tokens: CitationToken[],
): void {
  if (group.length === 0) return;
  if (group.length === 1) {
    const num = group[0];
    const source = sources[num - 1];
    if (source) tokens.push({ type: "single", num, source });
  } else {
    const groupSources = group.map((n) => sources[n - 1]).filter(Boolean);
    if (groupSources.length > 0) {
      tokens.push({ type: "group", nums: [...group], sources: groupSources });
    }
  }
}

// ---------------------------------------------------------------------------
// Citation text processing utilities
// ---------------------------------------------------------------------------

/**
 * Walk react-markdown children and replace "[N]" text fragments
 * with CitationBadge or GroupedCitationBadge components.
 */
export function processCitationsInChildren(
  children: React.ReactNode,
  sources: any[],
): React.ReactNode {
  return Array.isArray(children)
    ? children.map((child, i) => processCitationNode(child, sources, i))
    : processCitationNode(children, sources, 0);
}

export function processCitationNode(
  node: React.ReactNode,
  sources: any[],
  key: number,
): React.ReactNode {
  if (typeof node !== "string") return node;
  // Split string on citation patterns like [1], [2], [1][2]
  const parts = node.split(/(\[\d+\])/g);
  if (parts.length === 1) return node;

  const tokens = groupCitationParts(parts, sources);

  return tokens.map((token, i) => {
    if (token.type === "text") return token.text;
    if (token.type === "single")
      return (
        <CitationBadge
          key={`${key}-cite-${i}`}
          num={token.num}
          source={token.source}
        />
      );
    return (
      <GroupedCitationBadge
        key={`${key}-group-${i}`}
        nums={token.nums}
        sources={token.sources}
      />
    );
  });
}
