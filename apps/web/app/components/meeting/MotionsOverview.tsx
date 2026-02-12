import { useState } from "react";
import {
  Gavel,
  CheckCircle2,
  XCircle,
  MinusCircle,
  PlayCircle,
  ChevronDown,
  ChevronRight,
  Filter,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import type { AgendaItem, Motion, Vote } from "../../lib/types";
import { formatTimestamp } from "../../lib/timeline-utils";

interface MotionsOverviewProps {
  agendaItems: AgendaItem[];
  onWatchMotion?: (time: number) => void;
}

type FilterType = "all" | "carried" | "defeated";

export function MotionsOverview({
  agendaItems,
  onWatchMotion,
}: MotionsOverviewProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [expandedMotionId, setExpandedMotionId] = useState<number | null>(null);

  // Flatten all motions with their agenda item context
  const allMotions = agendaItems.flatMap((item) =>
    (item.motions || []).map((motion) => ({
      ...motion,
      agendaItem: item,
    })),
  );

  const filteredMotions = allMotions.filter((motion) => {
    if (filter === "all") return true;
    if (filter === "carried") return motion.result === "CARRIED";
    if (filter === "defeated") return motion.result === "DEFEATED";
    return true;
  });

  const carriedCount = allMotions.filter((m) => m.result === "CARRIED").length;
  const defeatedCount = allMotions.filter(
    (m) => m.result === "DEFEATED",
  ).length;

  if (allMotions.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-12 text-center">
        <Gavel className="h-12 w-12 mx-auto mb-4 text-zinc-300" />
        <h3 className="text-lg font-semibold text-zinc-900 mb-2">No Motions</h3>
        <p className="text-zinc-500">
          No formal motions were recorded for this meeting.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
      {/* Header with filter */}
      <div className="p-5 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-900">Motions & Votes</h2>
          <p className="text-sm text-zinc-500 mt-1">
            {allMotions.length} motion{allMotions.length !== 1 ? "s" : ""}{" "}
            recorded
            {carriedCount > 0 && ` · ${carriedCount} carried`}
            {defeatedCount > 0 && ` · ${defeatedCount} defeated`}
          </p>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-zinc-400" />
          <div className="flex bg-zinc-100 rounded-lg p-0.5">
            {[
              { id: "all", label: "All" },
              { id: "carried", label: "Carried" },
              { id: "defeated", label: "Defeated" },
            ].map((option) => (
              <button
                key={option.id}
                onClick={() => setFilter(option.id as FilterType)}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold rounded-md transition-all",
                  filter === option.id
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Motions list */}
      <div className="divide-y divide-zinc-100">
        {filteredMotions.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">
            No {filter} motions found.
          </div>
        ) : (
          filteredMotions.map((motion) => (
            <MotionRow
              key={motion.id}
              motion={motion}
              agendaItem={motion.agendaItem}
              isExpanded={expandedMotionId === motion.id}
              onToggle={() =>
                setExpandedMotionId(
                  expandedMotionId === motion.id ? null : motion.id,
                )
              }
              onWatch={
                onWatchMotion && motion.time_offset_seconds !== undefined
                  ? () => onWatchMotion(motion.time_offset_seconds!)
                  : undefined
              }
            />
          ))
        )}
      </div>

      {/* Summary footer */}
      <div className="p-4 bg-zinc-50 border-t border-zinc-100">
        <div className="flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-zinc-600">
              <span className="font-bold text-zinc-900">{carriedCount}</span>{" "}
              Carried
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-zinc-600">
              <span className="font-bold text-zinc-900">{defeatedCount}</span>{" "}
              Defeated
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MotionRowProps {
  motion: Motion;
  agendaItem: AgendaItem;
  isExpanded: boolean;
  onToggle: () => void;
  onWatch?: () => void;
}

function MotionRow({
  motion,
  agendaItem,
  isExpanded,
  onToggle,
  onWatch,
}: MotionRowProps) {
  const votes = motion.votes || [];
  const yesVotes = votes.filter((v) => v.vote === "Yes");
  const noVotes = votes.filter((v) => v.vote === "No");
  const otherVotes = votes.filter((v) => v.vote !== "Yes" && v.vote !== "No");

  return (
    <div className={cn("transition-colors", isExpanded && "bg-zinc-50")}>
      {/* Main row - using div instead of button to allow nested interactive elements */}
      <div
        onClick={onToggle}
        className="w-full p-5 text-left flex items-start gap-4 hover:bg-zinc-50 transition-colors cursor-pointer"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        {/* Result indicator */}
        <div
          className={cn(
            "mt-1 w-3 h-3 rounded-full flex-shrink-0",
            motion.result === "CARRIED"
              ? "bg-green-500"
              : motion.result === "DEFEATED"
                ? "bg-red-500"
                : "bg-zinc-400",
          )}
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Agenda item context */}
          <div className="text-xs text-zinc-400 mb-1">
            {agendaItem.item_order}. {agendaItem.title}
          </div>

          {/* Motion text */}
          <p className="text-sm text-zinc-800 leading-relaxed">
            {motion.plain_english_summary || motion.text_content}
          </p>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3 mt-3">
            {/* Result badge */}
            <Badge
              variant={motion.result === "CARRIED" ? "default" : "destructive"}
              className="text-xs"
            >
              {motion.result || "Pending"}
              {motion.yes_votes > 0 && (
                <span className="ml-1 opacity-80">
                  ({motion.yes_votes}-{motion.no_votes})
                </span>
              )}
            </Badge>

            {/* Mover/Seconder */}
            {(motion.mover_person?.name || motion.mover) && (
              <span className="text-xs text-zinc-500">
                Moved by{" "}
                <span className="font-medium text-zinc-700">
                  {motion.mover_person?.name || motion.mover}
                </span>
              </span>
            )}

            {/* Watch button */}
            {onWatch && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onWatch();
                }}
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
              >
                <PlayCircle className="h-3.5 w-3.5" />
                {motion.time_offset_seconds !== undefined
                  ? formatTimestamp(motion.time_offset_seconds)
                  : "Watch"}
              </button>
            )}
          </div>
        </div>

        {/* Expand indicator */}
        {votes.length > 0 && (
          <div className="flex-shrink-0 text-zinc-400">
            {isExpanded ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <ChevronRight className="h-5 w-5" />
            )}
          </div>
        )}
      </div>

      {/* Expanded votes */}
      {isExpanded && votes.length > 0 && (
        <div className="px-5 pb-5 pl-12">
          <div className="bg-white rounded-xl border border-zinc-200 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
              Vote Breakdown
            </h4>

            <div className="space-y-4">
              {/* Yes votes */}
              {yesVotes.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-green-700">
                      Yes ({yesVotes.length})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {yesVotes.map((vote) => (
                      <span
                        key={vote.id}
                        className="px-2 py-1 bg-green-50 text-green-700 text-xs rounded-md border border-green-100"
                      >
                        {vote.person?.name || "Unknown"}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* No votes */}
              {noVotes.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium text-red-700">
                      No ({noVotes.length})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {noVotes.map((vote) => (
                      <span
                        key={vote.id}
                        className="px-2 py-1 bg-red-50 text-red-700 text-xs rounded-md border border-red-100"
                      >
                        {vote.person?.name || "Unknown"}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Abstain/Recused */}
              {otherVotes.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <MinusCircle className="h-4 w-4 text-zinc-400" />
                    <span className="text-sm font-medium text-zinc-600">
                      Abstain/Recused ({otherVotes.length})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {otherVotes.map((vote) => (
                      <span
                        key={vote.id}
                        className="px-2 py-1 bg-zinc-100 text-zinc-600 text-xs rounded-md border border-zinc-200"
                      >
                        {vote.person?.name || "Unknown"} ({vote.vote})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
