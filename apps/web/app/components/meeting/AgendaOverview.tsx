import { useState } from "react";
import {
  ChevronRight,
  Clock,
  DollarSign,
  Gavel,
  Info,
  MapPin,
  MessageSquare,
  PlayCircle,
  Tag,
  ThumbsDown,
  ThumbsUp,
  Minus,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "../../lib/utils";
import type { AgendaItem, Motion, Vote, DocumentSection, ExtractedDocument } from "../../lib/types";
import { Badge } from "../ui/badge";
import { formatTimestamp } from "../../lib/timeline-utils";
import { DocumentSections } from "./DocumentSections";

interface AgendaOverviewProps {
  items: AgendaItem[];
  documentSections?: DocumentSection[];
  extractedDocuments?: ExtractedDocument[];
  expandedItemId: number | null;
  onItemClick: (id: number) => void;
  onWatchVideo: (startTime: number, itemId: number) => void;
  onMotionClick?: (motion: Motion, agendaItem: AgendaItem) => void;
}

export function AgendaOverview({
  items,
  documentSections,
  extractedDocuments,
  expandedItemId,
  onItemClick,
  onWatchVideo,
  onMotionClick,
}: AgendaOverviewProps) {
  const groups = groupAgendaItems(items);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
      <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
        <h2 className="text-lg font-bold text-zinc-900">Agenda</h2>
        <span className="text-xs font-medium text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full">
          {items.length} items
        </span>
      </div>

      <div className="divide-y divide-zinc-100">
        {items.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 italic">
            No agenda items available for this meeting.
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="relative py-2">
              {/* If we have a main parent item, render it first */}
              {group.parent ? (
                <AgendaItemRow
                  item={group.parent}
                  documentSections={documentSections}
                  extractedDocuments={extractedDocuments}
                  displayOrder={cleanOrder(group.parent.item_order)}
                  isExpanded={expandedItemId === group.parent.id}
                  onToggle={() => onItemClick(group.parent!.id)}
                  onWatchVideo={(startTime) =>
                    onWatchVideo(startTime, group.parent!.id)
                  }
                  onMotionClick={onMotionClick}
                  variant="parent"
                  hasChildren={group.children.length > 0}
                />
              ) : group.key !== "other" && group.children.length > 0 ? (
                /* Virtual Parent Header for orphaned items */
                <div className="flex items-center px-4 py-3 gap-4 bg-zinc-50/30 border-b border-zinc-100/50 mb-1">
                  <div className="w-10 h-10 rounded-lg bg-zinc-100 text-zinc-400 text-lg flex items-center justify-center font-mono font-bold select-none">
                    {group.key}
                  </div>
                  <div className="text-zinc-400 font-medium text-xs uppercase tracking-wider">
                    Section {group.key}
                  </div>
                </div>
              ) : null}

              {/* Render children */}
              <div className="flex flex-col">
                {group.children.map((child, idx) => {
                  const isLast = idx === group.children.length - 1;
                  // Simplify child order: remove parent prefix if present
                  let displayOrder = cleanOrder(child.item_order);
                  const parentPrefix = group.key;

                  if (
                    group.key !== "other" &&
                    displayOrder.startsWith(parentPrefix)
                  ) {
                    const suffix = displayOrder.slice(parentPrefix.length);
                    // Only simplify if the suffix looks like a child separator (dot, space, paren)
                    if (/^[.\-)\s]/.test(suffix)) {
                      displayOrder = suffix.replace(/^[.\-)\s]+/, "");
                    }
                  }

                  return (
                    <AgendaItemRow
                      key={child.id}
                      item={child}
                      documentSections={documentSections}
                      extractedDocuments={extractedDocuments}
                      displayOrder={displayOrder}
                      isExpanded={expandedItemId === child.id}
                      onToggle={() => onItemClick(child.id)}
                      onWatchVideo={(startTime) =>
                        onWatchVideo(startTime, child.id)
                      }
                      onMotionClick={onMotionClick}
                      variant={group.key !== "other" ? "child" : "flat"}
                      isLastChild={isLast}
                    />
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// --- Grouping Logic ---

interface AgendaGroup {
  key: string;
  parent?: AgendaItem;
  children: AgendaItem[];
  numericKey: number;
}

function groupAgendaItems(items: AgendaItem[]): AgendaGroup[] {
  const groups: Record<string, AgendaGroup> = {};
  const sortedItems = [...items].sort(naturalSortItems);

  for (const item of sortedItems) {
    const order = cleanOrder(item.item_order);
    // Extract the primary section number (e.g., "3" from "3.a", "6" from "6.1")
    // Fallback to the full order if it doesn't start with a number.
    // Also capture letter-based sections like "q)".
    const match = order.match(/^(\d+|[a-z]\))/i);
    const key = match ? match[1] : "other";

    let numericKey = 9999;
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num)) {
        numericKey = num;
      } else {
        // For letter-based sections, put them after numeric sections
        numericKey = match[1].charCodeAt(0) + 1000;
      }
    }

    if (!groups[key]) {
      groups[key] = { key, children: [], numericKey };
    }

    // Check if this item IS the section header (e.g. order is exactly "3")
    // We treat it as parent if it matches the key exactly, OR if it's the first item and looks like a parent
    if (order === key) {
      if (groups[key].parent) {
        // Duplicate parent number? Treat as child or fallback
        groups[key].children.push(item);
      } else {
        groups[key].parent = item;
      }
    } else {
      groups[key].children.push(item);
    }
  }

  // Convert map to sorted array
  return Object.values(groups).sort((a, b) => {
    if (a.key === "other") return 1;
    if (b.key === "other") return -1;
    return a.numericKey - b.numericKey;
  });
}

function cleanOrder(order?: string): string {
  if (!order) return "";
  // Remove leading/trailing parens, dots, and whitespace
  return order.trim().replace(/^[\s(.)]+|[\s(.)]+$/g, "");
}

function naturalSortItems(a: AgendaItem, b: AgendaItem) {
  const orderA = cleanOrder(a.item_order);
  const orderB = cleanOrder(b.item_order);
  return orderA.localeCompare(orderB, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function formatDiscussionDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "<1m";
}

// --- Components ---

interface AgendaItemRowProps {
  item: AgendaItem;
  documentSections?: DocumentSection[];
  extractedDocuments?: ExtractedDocument[];
  displayOrder: string;
  isExpanded: boolean;
  onToggle: () => void;
  onWatchVideo: (startTime: number) => void;
  onMotionClick?: (motion: Motion, agendaItem: AgendaItem) => void;
  variant: "parent" | "child" | "flat";
  hasChildren?: boolean;
  isLastChild?: boolean;
}

function AgendaItemRow({
  item,
  documentSections,
  extractedDocuments,
  displayOrder,
  isExpanded,
  onToggle,
  onWatchVideo,
  onMotionClick,
  variant,
  hasChildren,
  isLastChild,
}: AgendaItemRowProps) {
  const linkedSections = (documentSections || []).filter(
    (s) => s.agenda_item_id === item.id,
  );
  const linkedExtractedDocs = (extractedDocuments || []).filter(
    (ed) => ed.agenda_item_id === item.id,
  );
  const motions = item.motions || [];
  const hasMotions = motions.length > 0;
  const motionCount = motions.length;
  const discussionDuration =
    item.discussion_start_time != null && item.discussion_end_time != null
      ? item.discussion_end_time - item.discussion_start_time
      : 0;

  const hasBadges =
    item.is_consent_agenda || item.category || item.is_controversial;
  const hasMetadata =
    (item.financial_cost !== undefined && item.financial_cost > 0) ||
    discussionDuration > 0 ||
    motionCount > 0 ||
    (item.keywords && item.keywords.length > 0);

  const isParent = variant === "parent";
  const isChild = variant === "child";

  return (
    <div className="relative">
      {/* Connector Line for Children */}
      {isChild && (
        <div
          className={cn(
            "absolute left-[1.65rem] top-0 w-px bg-zinc-200 -z-10",
            isLastChild ? "h-[2.5rem]" : "h-full",
          )}
        />
      )}

      {/* Row Button */}
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-start text-left transition-colors relative z-0",
          isExpanded
            ? "bg-zinc-50"
            : "hover:bg-zinc-50/50 hover:shadow-[inset_4px_0_0_0_rgba(0,0,0,0.05)]",
          isParent ? "py-4 pr-4 pl-4" : "py-3 pr-4 pl-4",
        )}
      >
        {/* Number Box / Tree Structure */}
        <div
          className={cn(
            "flex-shrink-0 flex items-center justify-center font-mono font-bold select-none mr-4",
            isParent &&
              "w-10 h-10 rounded-lg bg-zinc-100 text-zinc-900 text-lg",
            isChild && "w-10 h-8 ml-3", // Indent child
            !isParent &&
              !isChild &&
              "min-w-[2.5rem] w-auto h-10 px-1 rounded-lg bg-zinc-50 text-zinc-500 text-sm border border-zinc-100",
          )}
        >
          {isChild ? (
            <div className="flex items-center justify-center w-full h-full relative">
              {/* Horizontal connector */}
              <div className="absolute left-[-1.15rem] top-1/2 w-[1rem] h-px bg-zinc-200" />
              <span
                className={cn(
                  "block px-1.5 py-0.5 rounded text-xs min-w-[1.5rem] text-center",
                  item.is_consent_agenda
                    ? "bg-blue-50 text-blue-600 font-semibold"
                    : "bg-zinc-100 text-zinc-500",
                )}
              >
                {displayOrder || "•"}
              </span>
            </div>
          ) : (
            <span
              className={cn(
                // Auto-scale font size for longer IDs, but respect parent large style
                isParent
                  ? "text-lg"
                  : displayOrder.length > 3
                    ? "text-[10px] leading-tight"
                    : "text-sm",
              )}
            >
              {displayOrder || "#"}
            </span>
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
          {/* Badges Row */}
          {hasBadges && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {item.is_consent_agenda && (
                <Badge
                  variant="outline"
                  className="h-5 text-[9px] uppercase font-bold text-blue-600 border-blue-200 bg-blue-50"
                >
                  Consent
                </Badge>
              )}
              {item.category && (
                <Badge
                  variant="secondary"
                  className="h-5 text-[9px] uppercase font-bold"
                >
                  {item.category}
                </Badge>
              )}
              {item.is_controversial && (
                <Badge
                  variant="destructive"
                  className="h-5 text-[9px] uppercase font-bold bg-orange-500 hover:bg-orange-600"
                >
                  High Interest
                </Badge>
              )}
            </div>
          )}

          {/* Title */}
          <h3
            className={cn(
              "font-semibold leading-snug pr-2",
              isParent ? "text-zinc-900 text-base" : "text-zinc-700 text-sm",
            )}
          >
            {item.title}
          </h3>

          {/* Metadata Chips */}
          {hasMetadata && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {item.financial_cost !== undefined && item.financial_cost > 0 && (
                <span className="flex items-center text-[11px] font-semibold text-emerald-700">
                  <DollarSign className="w-3 h-3 mr-0.5" />
                  {new Intl.NumberFormat("en-CA", {
                    style: "currency",
                    currency: "CAD",
                    maximumFractionDigits: 0,
                  }).format(item.financial_cost)}
                </span>
              )}
              {discussionDuration > 0 && (
                <span className="flex items-center text-[11px] font-semibold text-zinc-500">
                  <Clock className="w-3 h-3 mr-0.5" />
                  {formatDiscussionDuration(discussionDuration)}
                </span>
              )}
              {motionCount > 0 && (
                <span className="flex items-center text-[11px] font-semibold text-amber-700">
                  <Gavel className="w-3 h-3 mr-0.5" />
                  {motionCount} {motionCount === 1 ? "motion" : "motions"}
                </span>
              )}
              {item.keywords && item.keywords.length > 0 && (
                <div className="flex items-center gap-1">
                  <Tag className="w-3 h-3 text-zinc-400" />
                  {item.keywords.slice(0, 2).map((kw) => (
                    <span
                      key={kw}
                      className="text-[10px] text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded"
                    >
                      {kw}
                    </span>
                  ))}
                  {item.keywords.length > 2 && (
                    <span className="text-[10px] text-zinc-400">
                      +{item.keywords.length - 2}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Motion Result + Chevron */}
        <div className="flex items-center gap-2 flex-shrink-0 pt-1 pl-2">
          <MotionResultBadge motions={motions} />
          <ChevronRight
            className={cn(
              "h-5 w-5 text-zinc-400 transition-transform flex-shrink-0",
              isExpanded && "rotate-90",
            )}
          />
        </div>
      </button>

      {/* Expanded Content */}
      <div
        className={cn(
          "grid transition-all duration-200 ease-in-out relative z-10",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          {/* Connector Line Continuation */}
          {isChild && !isLastChild && (
            <div className="absolute left-[1.65rem] top-0 bottom-0 w-px bg-zinc-200 -z-10" />
          )}

          <div
            className={cn(
              "pr-4 pb-4 pt-1",
              isParent ? "pl-4" : isChild ? "pl-[4.5rem]" : "pl-4",
            )}
          >
            <div className="space-y-6">
              {/* Plain English Summary */}
              {item.plain_english_summary && (
                <div className="space-y-1">
                  <h4 className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    <Info className="w-3 h-3 text-blue-500" />
                    Summary
                  </h4>
                  <p className="text-sm text-zinc-800 leading-relaxed pl-5">
                    {item.plain_english_summary}
                  </p>
                </div>
              )}

              {/* Description fallback */}
              {!item.plain_english_summary && item.description && (
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                    Description
                  </h4>
                  <p className="text-sm text-zinc-600 leading-relaxed whitespace-pre-line pl-0.5">
                    {item.description}
                  </p>
                </div>
              )}

              {/* Financial Impact */}
              {item.financial_cost !== undefined && item.financial_cost > 0 && (
                <div className="space-y-1">
                  <h4 className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    <DollarSign className="w-3 h-3 text-emerald-600" />
                    Financial Impact
                  </h4>
                  <p className="text-sm text-zinc-800 font-semibold pl-5">
                    {new Intl.NumberFormat("en-CA", {
                      style: "currency",
                      currency: "CAD",
                      maximumFractionDigits: 0,
                    }).format(item.financial_cost)}
                    {item.funding_source && (
                      <span className="font-normal text-zinc-500 ml-1">
                        &mdash; {item.funding_source}
                      </span>
                    )}
                  </p>
                </div>
              )}

              {/* Location / Addresses */}
              {item.related_address && item.related_address.length > 0 && (
                <div className="space-y-1">
                  <h4 className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    <MapPin className="w-3 h-3 text-violet-600" />
                    Location
                  </h4>
                  <div className="text-sm text-zinc-800 space-y-0.5 pl-5">
                    {item.related_address.map((addr, i) => (
                      <p key={i} className="text-zinc-700">
                        {addr}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Debate Summary */}
              {item.debate_summary && (
                <div className="space-y-1">
                  <h4 className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    <MessageSquare className="w-3 h-3 text-amber-500" />
                    Debate Summary
                  </h4>
                  <p className="text-sm text-zinc-800 leading-relaxed whitespace-pre-line pl-5">
                    {item.debate_summary}
                  </p>
                </div>
              )}

              {/* Watch Discussion Button */}
              {item.discussion_start_time != null && (
                <div className="pl-5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onWatchVideo(item.discussion_start_time!);
                    }}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <PlayCircle className="h-4 w-4" />
                    Watch Discussion
                    <span className="text-xs text-blue-400 font-mono">
                      {formatTimestamp(item.discussion_start_time)}
                      {discussionDuration > 0 &&
                        ` (${formatDiscussionDuration(discussionDuration)})`}
                    </span>
                  </button>
                </div>
              )}

              {/* Motions */}
              {hasMotions && (
                <div className="space-y-2">
                  <h4 className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    <Gavel className="w-3 h-3 text-zinc-500" />
                    Motions ({motionCount})
                  </h4>
                  <div className="pl-5 space-y-2">
                    {motions.map((motion) => (
                      <MotionCardInline
                        key={motion.id}
                        motion={motion}
                        agendaItem={item}
                        onWatchVideo={() => {
                          const time =
                            motion.time_offset_seconds ??
                            item.discussion_start_time;
                          if (time != null) {
                            onWatchVideo(time);
                          }
                        }}
                        onClick={
                          onMotionClick
                            ? () => onMotionClick(motion, item)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Document Sections */}
              {linkedSections.length > 0 && (
                <DocumentSections
                  sections={linkedSections}
                  extractedDocuments={linkedExtractedDocs}
                />
              )}

              {/* Keywords */}
              {item.keywords && item.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pl-5">
                  {item.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="text-[10px] font-medium text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-full border border-zinc-200"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Helpers ---

function MotionResultBadge({ motions }: { motions: Motion[] }) {
  if (!motions || motions.length === 0) return null;

  const allCarried = motions.every((m) => m.result === "Carried");
  const anyDefeated = motions.some((m) => m.result === "Defeated");

  if (allCarried) {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200">
        <ThumbsUp className="w-3 h-3 mr-1" />
        Carried
      </Badge>
    );
  }

  if (anyDefeated) {
    return (
      <Badge
        variant="destructive"
        className="bg-red-100 text-red-700 border-red-200 hover:bg-red-200"
      >
        <ThumbsDown className="w-3 h-3 mr-1" />
        Defeated
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="text-zinc-500 border-zinc-200 bg-zinc-50"
    >
      <Gavel className="w-3 h-3 mr-1" />
      Vote
    </Badge>
  );
}

interface MotionCardInlineProps {
  motion: Motion;
  agendaItem: AgendaItem;
  onWatchVideo: () => void;
  onClick?: () => void;
}

function MotionCardInline({
  motion,
  agendaItem,
  onWatchVideo,
  onClick,
}: MotionCardInlineProps) {
  const [showVotes, setShowVotes] = useState(false);
  const votes = motion.votes || [];

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative p-3 rounded-xl border border-zinc-200 bg-white hover:border-blue-300 transition-all",
        onClick && "cursor-pointer hover:shadow-sm",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                motion.result === "Carried"
                  ? "default"
                  : motion.result === "Defeated"
                    ? "destructive"
                    : "secondary"
              }
              className={cn(
                "h-5 text-[10px] px-1.5",
                motion.result === "Carried" &&
                  "bg-emerald-600 hover:bg-emerald-700",
                motion.result === "Defeated" && "bg-red-600 hover:bg-red-700",
              )}
            >
              {motion.result || "Motion"}
            </Badge>
            <span className="text-[10px] font-mono text-zinc-400 truncate">
              {motion.mover ? `Moved by ${motion.mover}` : "Mover not recorded"}
            </span>
            {votes.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowVotes(!showVotes);
                }}
                className="ml-auto text-[10px] font-medium text-zinc-500 hover:text-blue-600 flex items-center gap-1 bg-zinc-50 px-2 py-0.5 rounded-full border border-zinc-100 hover:border-blue-200 transition-colors"
              >
                {votes.length} Votes
                {showVotes ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            )}
          </div>

          <p className="text-sm text-zinc-800 font-medium leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all">
            {motion.text_content}
          </p>

          {showVotes && votes.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
              {votes.map((vote: Vote) => (
                <div
                  key={vote.id}
                  className="flex items-center gap-1.5 p-1.5 rounded bg-zinc-50 border border-zinc-100 text-xs"
                >
                  {vote.vote === "Yes" ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                  ) : vote.vote === "No" ? (
                    <XCircle className="h-3 w-3 text-red-500 flex-shrink-0" />
                  ) : (
                    <MinusCircle className="h-3 w-3 text-zinc-400 flex-shrink-0" />
                  )}
                  <span
                    className="truncate text-zinc-600"
                    title={vote.person?.name}
                  >
                    {vote.person?.name || "Unknown"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onWatchVideo();
          }}
          className="flex-shrink-0 text-zinc-400 hover:text-blue-600 transition-colors p-1"
          title="Watch discussion for this motion"
        >
          <PlayCircle className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
