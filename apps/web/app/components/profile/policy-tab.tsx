import { Target, MessageSquare } from "lucide-react";
import { StanceSummary } from "./stance-summary";
import type { CouncillorStance } from "../../services/profiling";
import type { CouncillorHighlight } from "../../services/profiling";
import { HighlightCard } from "./highlight-card";

interface PolicyTabProps {
  stances: CouncillorStance[];
  highlights: CouncillorHighlight[];
}

export function PolicyTab({ stances, highlights }: PolicyTabProps) {
  // Filter out "General" and "Administration" topics (procedural)
  const filteredStances = stances.filter(
    (s) => s.topic !== "Administration" && s.topic !== "General",
  );

  const hasContent = filteredStances.length > 0 || highlights.length > 0;

  if (!hasContent) {
    return (
      <div className="text-center py-16">
        <MessageSquare className="h-10 w-10 text-zinc-200 mx-auto mb-3" />
        <p className="text-sm text-zinc-400 font-medium">
          No policy positions available yet
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          Positions will appear after data processing.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notable Positions (highlights) */}
      {highlights.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
            Notable Positions
          </h3>
          {highlights.map((h, i) => (
            <HighlightCard key={i} highlight={h} />
          ))}
        </div>
      )}

      {/* Stances by topic */}
      {filteredStances.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
            Topic Stances
          </h3>
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden p-6">
            <StanceSummary stances={filteredStances} />
          </div>
        </div>
      )}
    </div>
  );
}
