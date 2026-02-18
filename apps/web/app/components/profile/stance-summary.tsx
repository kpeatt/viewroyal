import { useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronUp, MessageSquare, Quote, FileText } from "lucide-react";
import { Badge } from "../ui/badge";
import { cn, formatDate } from "../../lib/utils";
import { TOPIC_ICONS, TOPIC_COLORS, type TopicName } from "../../lib/topic-utils";
import { StanceSpectrum } from "./stance-spectrum";
import type { CouncillorStance } from "../../services/profiling";

// ── Types ──

interface StanceSummaryProps {
  stances: CouncillorStance[];
}

// ── Helpers ──

function confidenceBadge(confidence: "high" | "medium" | "low", statementCount: number) {
  const styles = {
    high: "bg-green-50 text-green-700 border-green-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    low: "bg-zinc-50 text-zinc-500 border-zinc-200",
  };

  return (
    <Badge
      variant="outline"
      className={cn("text-[9px] font-bold px-2 py-0.5", styles[confidence])}
    >
      Based on {statementCount} statement{statementCount !== 1 ? "s" : ""}
    </Badge>
  );
}

// ── Evidence Card ──

function EvidenceSection({
  quotes,
  motionIds,
}: {
  quotes: CouncillorStance["evidence_quotes"];
  motionIds: CouncillorStance["evidence_motion_ids"];
}) {
  const [expanded, setExpanded] = useState(false);

  const hasQuotes = quotes && quotes.length > 0;
  const hasMotions = motionIds && motionIds.length > 0;

  if (!hasQuotes && !hasMotions) return null;

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] font-bold text-zinc-500 hover:text-zinc-700 transition-colors"
      >
        <Quote className="h-3 w-3" />
        {hasQuotes ? `${quotes!.length} evidence quote${quotes!.length !== 1 ? "s" : ""}` : ""}
        {hasQuotes && hasMotions ? " + " : ""}
        {hasMotions ? `${motionIds!.length} related motion${motionIds!.length !== 1 ? "s" : ""}` : ""}
        {expanded ? (
          <ChevronUp className="h-3 w-3 ml-1" />
        ) : (
          <ChevronDown className="h-3 w-3 ml-1" />
        )}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {hasQuotes &&
            quotes!.map((q, i) => (
              <div
                key={i}
                className="bg-zinc-50 rounded-lg p-3 border border-zinc-100 text-xs"
              >
                <p className="text-zinc-700 italic leading-relaxed">
                  &ldquo;{q.text}&rdquo;
                </p>
                <div className="mt-1.5 flex items-center gap-2 text-[10px] text-zinc-400">
                  <Link
                    to={`/meetings/${q.meeting_id}`}
                    className="font-bold text-blue-600 hover:underline"
                  >
                    {formatDate(q.date)}
                  </Link>
                </div>
              </div>
            ))}

          {hasMotions && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {motionIds!.map((mId) => (
                <Link
                  key={mId}
                  to={`/motions/${mId}`}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 hover:bg-indigo-100 transition-colors"
                >
                  <FileText className="h-2.5 w-2.5" />
                  Motion #{mId}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Stance Card ──

function StanceCard({ stance }: { stance: CouncillorStance }) {
  const topicName = stance.topic as TopicName;
  const Icon = TOPIC_ICONS[topicName];
  const colors = TOPIC_COLORS[topicName] || "text-zinc-400 bg-zinc-50 border-zinc-100";
  const bgColorClass = colors.split(" ")[1]; // extract bg-* class
  const isLowData = stance.statement_count < 3;

  return (
    <div
      className={cn(
        "rounded-xl border p-4 space-y-3 transition-all",
        bgColorClass,
        "border-zinc-200/60"
      )}
    >
      {/* Header: topic + confidence */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-zinc-600" />}
          <span className="text-sm font-black text-zinc-800">{stance.topic}</span>
        </div>
        {confidenceBadge(stance.confidence, stance.statement_count)}
      </div>

      {/* Stance spectrum */}
      <StanceSpectrum
        score={stance.position_score ?? 0}
        position={stance.position}
      />

      {/* Summary */}
      {isLowData && (
        <p className="text-[11px] italic text-zinc-400 font-medium">
          Limited evidence -- interpretation may shift as more data is collected.
        </p>
      )}
      <p className="text-sm text-zinc-700 leading-relaxed">{stance.summary}</p>

      {/* Evidence */}
      <EvidenceSection
        quotes={stance.evidence_quotes}
        motionIds={stance.evidence_motion_ids}
      />
    </div>
  );
}

// ── Main Component ──

export function StanceSummary({ stances }: StanceSummaryProps) {
  if (!stances || stances.length === 0) {
    return (
      <div className="text-center py-12">
        <MessageSquare className="h-10 w-10 text-zinc-200 mx-auto mb-3" />
        <p className="text-sm text-zinc-400 font-medium">
          No stance data available
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          Positions will appear after data processing.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {stances.map((stance) => (
        <StanceCard key={stance.id} stance={stance} />
      ))}
    </div>
  );
}
