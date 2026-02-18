import { Link } from "react-router";
import { User } from "lucide-react";
import { cn } from "../../lib/utils";

// ── Types ──

interface SpeakerRankingProps {
  rankings: {
    person_id: number;
    person_name: string;
    image_url?: string | null;
    total_seconds: number;
  }[];
  currentPersonId: number;
}

// ── Helpers ──

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1);
}

// ── Main Component ──

export function SpeakerRanking({ rankings, currentPersonId }: SpeakerRankingProps) {
  // Filter out councillors with 0 speaking time, sort descending
  const filtered = rankings
    .filter((r) => r.total_seconds > 0)
    .sort((a, b) => b.total_seconds - a.total_seconds);

  if (filtered.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-zinc-400 italic font-medium">
          No speaking time data available for ranking.
        </p>
      </div>
    );
  }

  const maxSeconds = filtered[0].total_seconds;

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-3">
        Speaker Ranking
      </div>

      {filtered.map((r) => {
        const isCurrent = r.person_id === currentPersonId;
        const pct = maxSeconds > 0 ? (r.total_seconds / maxSeconds) * 100 : 0;

        return (
          <Link
            key={r.person_id}
            to={`/people/${r.person_id}`}
            className="flex items-center gap-2 group py-1"
          >
            {/* Avatar */}
            <div className="h-6 w-6 rounded-full bg-zinc-100 border border-zinc-200 overflow-hidden shrink-0">
              {r.image_url ? (
                <img
                  src={r.image_url}
                  alt={r.person_name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-3 w-3 m-1.5 text-zinc-300" />
              )}
            </div>

            {/* Name */}
            <span
              className={cn(
                "text-[10px] font-bold truncate w-16 shrink-0",
                isCurrent ? "text-blue-600" : "text-zinc-600 group-hover:text-zinc-900"
              )}
            >
              {r.person_name.split(" ").pop()}
            </span>

            {/* Bar */}
            <div className="flex-1 h-3 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  isCurrent ? "bg-blue-600" : "bg-zinc-200 group-hover:bg-zinc-300"
                )}
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Hours label */}
            <span
              className={cn(
                "text-[10px] font-bold tabular-nums w-10 text-right shrink-0",
                isCurrent ? "text-blue-600" : "text-zinc-500"
              )}
            >
              {formatHours(r.total_seconds)}h
            </span>
          </Link>
        );
      })}
    </div>
  );
}
