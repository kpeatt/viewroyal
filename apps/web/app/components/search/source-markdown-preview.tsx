import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/utils";

interface SourceMarkdownPreviewProps {
  content: string;
  maxLines?: number;
  className?: string;
}

export function SourceMarkdownPreview({
  content,
  maxLines = 4,
  className,
}: SourceMarkdownPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  // Rough heuristic: content > 200 chars likely needs truncation
  const needsTruncation = content.length > 200;

  return (
    <div className={className}>
      <div
        className={cn(
          "prose prose-xs prose-zinc max-w-none",
          "prose-headings:text-xs prose-headings:font-semibold prose-headings:mb-1 prose-headings:mt-2",
          "prose-p:text-xs prose-p:leading-relaxed prose-p:my-1",
          "prose-li:text-xs prose-li:my-0",
          "prose-table:text-[10px]",
          "prose-code:text-[10px] prose-code:px-1 prose-code:py-0.5 prose-code:bg-zinc-100 prose-code:rounded",
          !expanded && needsTruncation && `line-clamp-${maxLines}`,
        )}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
      {needsTruncation && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="text-[10px] font-medium text-blue-600 hover:text-blue-700 mt-1"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
