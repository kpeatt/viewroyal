import { Link } from "react-router";
import { CheckCircle, XCircle, HelpCircle } from "lucide-react";
import { Badge } from "../ui/badge";
import { cn, formatDate } from "../../lib/utils";
import type { CouncillorHighlight } from "../../services/profiling";

const POSITION_STYLES = {
  for: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50", border: "border-green-200", label: "Supports" },
  against: { icon: XCircle, color: "text-red-600", bg: "bg-red-50", border: "border-red-200", label: "Opposes" },
  nuanced: { icon: HelpCircle, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", label: "Nuanced" },
} as const;

export function HighlightCard({ highlight }: { highlight: CouncillorHighlight }) {
  const style = POSITION_STYLES[highlight.position] || POSITION_STYLES.nuanced;
  const Icon = style.icon;

  return (
    <div className={cn("rounded-xl border p-4 space-y-2", style.bg, style.border)}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-bold text-zinc-800 leading-snug">{highlight.title}</h4>
        <Badge variant="outline" className={cn("text-[9px] font-bold px-2 py-0.5 shrink-0", style.color, style.border)}>
          <Icon className="h-3 w-3 mr-1" />
          {style.label}
        </Badge>
      </div>
      <p className="text-sm text-zinc-600 leading-relaxed">{highlight.summary}</p>
      {highlight.evidence && highlight.evidence.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {highlight.evidence.map((e, i) => (
            <div key={i} className="bg-white/60 rounded-lg p-2.5 border border-zinc-100/60 text-xs">
              <p className="text-zinc-600 italic leading-relaxed">&ldquo;{e.text}&rdquo;</p>
              <div className="mt-1 text-[10px] text-zinc-400">
                {e.meeting_id ? (
                  <Link to={`/meetings/${e.meeting_id}`} className="font-bold text-blue-600 hover:underline">
                    {formatDate(e.date)}
                  </Link>
                ) : (
                  <span>{formatDate(e.date)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
