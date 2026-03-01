import { Link } from "react-router";
import { ExternalLink } from "lucide-react";
import { cn } from "../../lib/utils";
import { SourceIcon, SOURCE_TYPE_LABEL } from "./citation-badge";
import { SourceMarkdownPreview } from "./source-markdown-preview";

interface SourcePreviewContentProps {
  sources: any[];
}

export function SourcePreviewContent({ sources }: SourcePreviewContentProps) {
  return (
    <div className="divide-y divide-zinc-100">
      {sources.map((source, i) => (
        <SourcePreviewItem
          key={`${source.type}-${source.id}-${i}`}
          source={source}
        />
      ))}
    </div>
  );
}

function SourcePreviewItem({ source }: { source: any }) {
  const label = SOURCE_TYPE_LABEL[source?.type] || "Source";
  const link =
    source?.type === "bylaw" && source?.bylaw_id
      ? `/bylaws/${source.bylaw_id}`
      : source?.meeting_id
        ? `/meetings/${source.meeting_id}`
        : "#";

  return (
    <div className="px-3 py-2.5 first:pt-3 last:pb-3">
      {/* Header: type icon + label + date */}
      <div className="flex items-center gap-1.5 mb-1">
        <SourceIcon type={source?.type} className="h-3 w-3 text-zinc-400" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          {label}
        </span>
        {source?.meeting_date && (
          <span className="text-[10px] text-zinc-400 ml-auto">
            {source.meeting_date}
          </span>
        )}
      </div>

      {/* Type-specific content */}
      <SourceTypeContent source={source} />

      {/* Link to source page */}
      <Link
        to={link}
        className="flex items-center gap-1 mt-1.5 text-[10px] font-medium text-blue-600 hover:text-blue-700 no-underline"
      >
        {source?.type === "bylaw" ? "View bylaw" : "View in meeting"}
        <ExternalLink className="h-2.5 w-2.5" />
      </Link>
    </div>
  );
}

function SourceTypeContent({ source }: { source: any }) {
  switch (source?.type) {
    case "transcript":
    case "transcript_segment":
      return (
        <div>
          {source.speaker_name && (
            <p className="text-xs font-semibold text-zinc-700 mb-0.5">
              {source.speaker_name}
            </p>
          )}
          {source.content ? (
            <SourceMarkdownPreview
              content={source.content}
              className="text-zinc-600"
            />
          ) : (
            <p className="text-xs text-zinc-600 italic line-clamp-3">
              {source.title}
            </p>
          )}
        </div>
      );

    case "motion":
    case "vote":
      return (
        <div>
          {source.content ? (
            <SourceMarkdownPreview
              content={source.content}
              className="text-zinc-600"
            />
          ) : (
            <p className="text-xs text-zinc-600 line-clamp-3">
              {source.title}
            </p>
          )}
          {source.result && (
            <span
              className={cn(
                "inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
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
        </div>
      );

    case "bylaw":
      return (
        <div>
          <p className="text-xs font-semibold text-zinc-700 mb-0.5">
            {source.title}
          </p>
          {source.content && (
            <SourceMarkdownPreview
              content={source.content}
              className="text-zinc-600"
            />
          )}
        </div>
      );

    case "document_section":
      return (
        <div>
          <p className="text-xs font-semibold text-zinc-700 mb-0.5">
            {source.title}
          </p>
          {source.content && (
            <SourceMarkdownPreview
              content={source.content}
              className="text-zinc-600"
            />
          )}
        </div>
      );

    case "key_statement":
      return (
        <div>
          {source.speaker_name && (
            <p className="text-xs font-semibold text-zinc-700 mb-0.5">
              {source.speaker_name}
            </p>
          )}
          {source.content ? (
            <SourceMarkdownPreview
              content={source.content}
              className="text-zinc-600"
            />
          ) : (
            <p className="text-xs text-zinc-600 line-clamp-3">
              {source.title}
            </p>
          )}
        </div>
      );

    default:
      return (
        <p className="text-xs text-zinc-600 line-clamp-3">
          {source?.title || "View source"}
        </p>
      );
  }
}
