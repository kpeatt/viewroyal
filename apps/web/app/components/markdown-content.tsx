import { marked } from "marked";
import { cn } from "../lib/utils";

// Configure marked for GFM (tables, strikethrough, etc.)
marked.use({ gfm: true, breaks: false });

interface MarkdownContentProps {
  content: string;
  className?: string;
}

/**
 * Lightweight inline markdown renderer for document sections.
 * Uses `marked` to convert markdown to HTML synchronously, avoiding
 * react-markdown hydration mismatches between server and client.
 */
export function MarkdownContent({ content, className }: MarkdownContentProps) {
  const html = marked.parse(content, { async: false }) as string;

  return (
    <div
      className={cn(
        "prose prose-zinc prose-sm max-w-none",
        "prose-headings:font-sans prose-headings:font-semibold prose-headings:text-zinc-900",
        "prose-h2:text-base prose-h2:mt-4 prose-h2:mb-2",
        "prose-h3:text-sm prose-h3:mt-3 prose-h3:mb-1",
        "prose-h4:text-xs prose-h4:uppercase prose-h4:tracking-wide prose-h4:mt-2 prose-h4:mb-1",
        "prose-p:text-sm prose-p:leading-relaxed prose-p:text-zinc-700 prose-p:my-1.5",
        "prose-li:text-sm prose-li:text-zinc-700 prose-li:marker:text-zinc-400 prose-li:my-0.5",
        "prose-ul:my-1.5 prose-ol:my-1.5",
        "prose-strong:font-semibold prose-strong:text-zinc-800",
        "prose-blockquote:border-l-2 prose-blockquote:border-zinc-200 prose-blockquote:pl-3 prose-blockquote:text-zinc-600 prose-blockquote:not-italic prose-blockquote:my-2",
        "prose-table:text-xs prose-table:my-3",
        "prose-th:bg-zinc-50 prose-th:p-2 prose-th:text-left prose-th:font-semibold",
        "prose-td:p-2 prose-td:border-t prose-td:border-zinc-100",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
