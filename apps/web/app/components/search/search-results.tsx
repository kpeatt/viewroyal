import { useState, useEffect } from "react";
import type { UnifiedSearchResult } from "../../services/hybrid-search.server";
import { ResultCard } from "./result-card";
import { Search, ChevronDown } from "lucide-react";

const PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// SearchResults component
// ---------------------------------------------------------------------------

interface SearchResultsProps {
  results: UnifiedSearchResult[];
  query: string;
  isLoading: boolean;
  activeTypes?: Array<UnifiedSearchResult["type"]>;
}

export function SearchResults({
  results,
  query,
  isLoading,
  activeTypes,
}: SearchResultsProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Reset visible count when results change (new search)
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [results]);

  const visibleResults = results.slice(0, visibleCount);
  const hasMore = results.length > visibleCount;

  return (
    <div className="space-y-4">
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
      {!isLoading && results.length > 0 && (
        <div className="space-y-3">
          {visibleResults.map((result, index) => (
            <ResultCard
              key={`${result.type}-${result.id}`}
              result={result}
              query={query}
              position={index}
            />
          ))}

          {/* Show more button */}
          {hasMore && (
            <button
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="w-full py-3 text-sm font-medium text-zinc-500 hover:text-zinc-700 bg-white rounded-2xl border border-zinc-200 hover:border-zinc-300 transition-colors flex items-center justify-center gap-1.5"
            >
              <ChevronDown className="h-4 w-4" />
              Show more ({results.length - visibleCount} remaining)
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && results.length === 0 && (
        <div className="text-center py-16">
          <Search className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">
            {activeTypes && activeTypes.length > 0
              ? `No results found for "${query}" with the selected filters. Try broadening your search.`
              : `No results found for "${query}". Try different keywords.`}
          </p>
        </div>
      )}
    </div>
  );
}
