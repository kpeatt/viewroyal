import { marked, Renderer } from "marked";
import { cn } from "../lib/utils";

// Configure marked for GFM with custom table renderer
const defaultRenderer = new Renderer();
marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    table(...args: Parameters<typeof defaultRenderer.table>) {
      const html = defaultRenderer.table.apply(this, args);
      return `<div class="table-scroll-container overflow-x-auto -mx-2 px-2 my-4">${html}</div>`;
    },
  },
});

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
        "prose prose-zinc max-w-none",
        "prose-headings:font-sans prose-headings:font-semibold prose-headings:text-zinc-900",
        "prose-h1:text-2xl prose-h1:mt-8 prose-h1:mb-4",
        "prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3 prose-h2:pb-2 prose-h2:border-b prose-h2:border-zinc-200",
        "prose-h3:text-base prose-h3:font-bold prose-h3:mt-6 prose-h3:mb-2",
        "prose-h4:text-sm prose-h4:uppercase prose-h4:tracking-wide prose-h4:font-semibold prose-h4:mt-4 prose-h4:mb-2 prose-h4:text-zinc-600",
        "prose-p:leading-relaxed prose-p:text-zinc-700 prose-p:my-3",
        "prose-li:text-zinc-700 prose-li:marker:text-zinc-400 prose-li:my-1.5",
        "prose-ul:my-3 prose-ol:my-3",
        "prose-strong:font-semibold prose-strong:text-zinc-800",
        "prose-blockquote:border-l-4 prose-blockquote:border-indigo-300 prose-blockquote:bg-indigo-50/40 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-blockquote:text-zinc-700 prose-blockquote:not-italic prose-blockquote:my-4",
        "prose-table:text-xs prose-table:my-0 prose-table:border-none",
        "prose-thead:border-b prose-thead:border-zinc-200",
        "prose-th:bg-zinc-100 prose-th:p-2 prose-th:text-left prose-th:font-semibold prose-th:text-zinc-900 prose-th:border-none",
        "prose-td:p-2 prose-td:border-t prose-td:border-zinc-100 prose-td:border-x-0",
        "[&_tbody_tr:nth-child(even)]:bg-zinc-50/60",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
