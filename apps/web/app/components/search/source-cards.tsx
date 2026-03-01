import { Link } from "react-router";
import { FileText, ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "../../lib/utils";
import { SourceIcon, SOURCE_TYPE_LABEL } from "./citation-badge";
import { SourceMarkdownPreview } from "./source-markdown-preview";

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
        <span>{sources.length} sources used</span>
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
          <div className="grid gap-2 sm:grid-cols-2">
            {sources.map((source: any, i: number) => (
              <SourceCard
                key={`${source.type}-${source.id}-${i}`}
                source={source}
                index={i}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceCard({ source, index }: { source: any; index: number }) {
  const label = SOURCE_TYPE_LABEL[source?.type] || "Source";
  const link =
    source?.type === "bylaw" && source?.bylaw_id
      ? `/bylaws/${source.bylaw_id}`
      : source?.meeting_id
        ? `/meetings/${source.meeting_id}`
        : "#";

  return (
    <div className="p-3 bg-white rounded-lg border border-zinc-200 hover:border-blue-200 transition-colors">
      {/* Header row */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700 shrink-0">
          {index + 1}
        </span>
        <SourceIcon type={source.type} className="h-3 w-3 text-zinc-400" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          {label}
        </span>
        {source?.meeting_date && (
          <span className="text-[10px] text-zinc-400 ml-auto">
            {source.meeting_date}
          </span>
        )}
      </div>

      {/* Speaker name */}
      {source?.speaker_name && (
        <p className="text-xs font-semibold text-zinc-700 mb-0.5">
          {source.speaker_name}
        </p>
      )}

      {/* Content with markdown rendering */}
      {source?.content ? (
        <SourceMarkdownPreview
          content={source.content}
          maxLines={3}
          className="text-zinc-600 mb-1.5"
        />
      ) : (
        <p className="text-xs text-zinc-500 line-clamp-2 mb-1.5">
          {source?.title}
        </p>
      )}

      {/* Motion result badge */}
      {source?.result && (
        <span
          className={cn(
            "inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full mb-1.5",
            source.result.toLowerCase().includes("carried") ||
              source.result.toLowerCase().includes("passed")
              ? "bg-green-100 text-green-700"
              : source.result.toLowerCase().includes("defeated")
                ? "bg-red-100 text-red-700"
                : "bg-zinc-100 text-zinc-600",
          )}
        >
          {source.result}
        </span>
      )}

      {/* Link */}
      <Link
        to={link}
        className="flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-700 no-underline"
      >
        {source?.type === "bylaw" ? "View bylaw" : "View in meeting"}
        <ExternalLink className="h-2.5 w-2.5" />
      </Link>
    </div>
  );
}
