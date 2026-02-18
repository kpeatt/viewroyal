import { useState } from "react";
import { cn } from "../../lib/utils";
import type { UnifiedSearchResult } from "../../services/hybrid-search.server";
import { ResultCard } from "./result-card";
import { Search, Gavel, MessageSquare, FileText, Mic, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Filter pill types
// ---------------------------------------------------------------------------

type FilterType = "all" | "motion" | "key_statement" | "document_section" | "transcript_segment";

const FILTERS: Array<{
  key: FilterType;
  label: string;
  Icon: React.ElementType;
}> = [
  { key: "all", label: "All", Icon: Search },
  { key: "motion", label: "Motions", Icon: Gavel },
  { key: "key_statement", label: "Key Statements", Icon: MessageSquare },
  { key: "document_section", label: "Documents", Icon: FileText },
  { key: "transcript_segment", label: "Transcripts", Icon: Mic },
];

// ---------------------------------------------------------------------------
// SearchResults component
// ---------------------------------------------------------------------------

interface SearchResultsProps {
  results: UnifiedSearchResult[];
  query: string;
  isLoading: boolean;
}

export function SearchResults({ results, query, isLoading }: SearchResultsProps) {
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");

  const filtered =
    activeFilter === "all"
      ? results
      : results.filter((r) => r.type === activeFilter);

  return (
    <div className="space-y-4">
      {/* Filter controls */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(({ key, label, Icon }) => {
          const count =
            key === "all"
              ? results.length
              : results.filter((r) => r.type === key).length;

          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveFilter(key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border",
                activeFilter === key
                  ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm"
                  : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300",
              )}
            >
              <Icon
                className={cn(
                  "h-3.5 w-3.5",
                  activeFilter === key ? "text-blue-500" : "text-zinc-400",
                )}
              />
              {label}
              {count > 0 && (
                <span
                  className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    activeFilter === key
                      ? "bg-blue-200 text-blue-800"
                      : "bg-zinc-100 text-zinc-500",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-5 bg-white rounded-2xl border border-zinc-200 animate-pulse"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="h-4 w-4 bg-zinc-200 rounded" />
                <div className="h-4 w-20 bg-zinc-200 rounded" />
                <div className="h-4 w-24 bg-zinc-200 rounded ml-auto" />
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-zinc-200 rounded w-full" />
                <div className="h-4 bg-zinc-200 rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results list */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((result) => (
            <ResultCard key={`${result.type}-${result.id}`} result={result} query={query} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && results.length === 0 && (
        <div className="text-center py-16">
          <Search className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">
            No results found for "{query}". Try different keywords.
          </p>
        </div>
      )}

      {/* Filtered empty state */}
      {!isLoading && results.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-zinc-500 text-sm">
            No {activeFilter.replace("_", " ")} results. Try a different filter.
          </p>
        </div>
      )}
    </div>
  );
}
