import { useState } from "react";
import { Link } from "react-router";
import { Scale } from "lucide-react";
import { Badge } from "../ui/badge";
import { cn, formatDate } from "../../lib/utils";

interface Decision {
  id: number;
  summary: string;
  result: string;
  financialCost: number | null;
  meetingId: number;
  meetingDate: string;
  meetingTitle: string;
  yesCount: number;
  noCount: number;
  isDivided: boolean;
}

interface DecisionsFeedSectionProps {
  decisions: Decision[];
}

export function DecisionsFeedSection({ decisions }: DecisionsFeedSectionProps) {
  if (decisions.length === 0) return null;

  const [filter, setFilter] = useState<"recent" | "divided">("recent");

  const dividedDecisions = decisions.filter((d) => d.isDivided);
  const displayedDecisions =
    filter === "divided" ? dividedDecisions : decisions.slice(0, 8);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
          <Scale className="h-4 w-4" />
          Decisions
        </h2>
        <Link
          to="/meetings"
          className="text-xs text-blue-600 hover:underline font-semibold"
        >
          View all
        </Link>
      </div>

      {/* Filter toggle */}
      <div className="flex gap-1 mb-4 bg-zinc-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setFilter("recent")}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
            filter === "recent"
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500 hover:text-zinc-700"
          )}
        >
          Recent
        </button>
        <button
          onClick={() => setFilter("divided")}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
            filter === "divided"
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500 hover:text-zinc-700"
          )}
        >
          Controversial
          {dividedDecisions.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
              {dividedDecisions.length}
            </span>
          )}
        </button>
      </div>

      {displayedDecisions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 text-center">
          <p className="text-sm text-zinc-500">
            No controversial decisions in recent meetings
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden divide-y divide-zinc-100">
          {displayedDecisions.map((decision) => (
            <Link
              key={decision.id}
              to={`/meetings/${decision.meetingId}`}
              className={cn(
                "block p-4 hover:bg-zinc-50 transition-colors",
                decision.isDivided && "border-l-2 border-l-amber-400"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-700 line-clamp-2 mb-2">
                    {decision.summary}
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Result badge */}
                    <Badge
                      className={cn(
                        "text-[10px] border-0",
                        decision.result === "CARRIED"
                          ? "bg-green-100 text-green-700 hover:bg-green-100"
                          : "bg-red-100 text-red-700 hover:bg-red-100"
                      )}
                    >
                      {decision.result === "CARRIED" ? "Carried" : "Defeated"}
                    </Badge>

                    {/* Vote breakdown text */}
                    <span className="text-xs font-medium text-zinc-500">
                      {decision.yesCount}-{decision.noCount}
                    </span>

                    {/* Vote visual dots */}
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: decision.yesCount }).map(
                        (_, i) => (
                          <span
                            key={`y-${i}`}
                            className="w-2 h-2 rounded-full bg-green-500"
                          />
                        )
                      )}
                      {Array.from({ length: decision.noCount }).map((_, i) => (
                        <span
                          key={`n-${i}`}
                          className="w-2 h-2 rounded-full bg-red-500"
                        />
                      ))}
                    </div>

                    {/* Divided vote badge */}
                    {decision.isDivided && (
                      <Badge className="text-[10px] bg-amber-100 text-amber-700 hover:bg-amber-100 border-0">
                        Divided
                      </Badge>
                    )}

                    {/* Financial cost */}
                    {decision.financialCost != null &&
                      decision.financialCost > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                          ${decision.financialCost.toLocaleString()}
                        </Badge>
                      )}
                  </div>

                  {/* Meeting context */}
                  {decision.meetingDate && (
                    <p className="text-[10px] text-zinc-400 mt-2">
                      {formatDate(decision.meetingDate)}
                      {decision.meetingTitle &&
                        ` - ${decision.meetingTitle}`}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
