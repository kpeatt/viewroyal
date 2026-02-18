import { Link } from "react-router";
import { FileText, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";
import { SourceIcon } from "./citation-badge";

interface SourceCardsProps {
  sources: any[];
  isOpen: boolean;
  onToggle: () => void;
}

export function SourceCards({ sources, isOpen, onToggle }: SourceCardsProps) {
  if (sources.length === 0) return null;

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-600 transition-colors mb-2"
      >
        <FileText className="h-3.5 w-3.5" />
        <span>Sources ({sources.length})</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-all duration-200 ease-in-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="flex flex-wrap gap-1.5">
            {sources.map((source: any, i: number) => (
              <Link
                key={`${source.type}-${source.id}-${i}`}
                to={
                  source.meeting_id
                    ? `/meetings/${source.meeting_id}`
                    : "#"
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white rounded-lg border border-zinc-200 hover:border-blue-200 hover:bg-blue-50/50 transition-colors group text-xs"
              >
                <span className="w-5 h-5 rounded-full bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center text-[10px] font-bold text-blue-700 shrink-0">
                  {i + 1}
                </span>
                <SourceIcon type={source.type} />
                <span className="text-zinc-500 max-w-[180px] truncate">
                  {source.meeting_date}
                  {source.speaker_name ? ` -- ${source.speaker_name}` : ""}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
