import { useState } from "react";
import { cn } from "../../lib/utils";
import {
  TIME_OPTIONS,
  SORT_OPTIONS,
  TYPE_OPTIONS,
  type ContentType,
} from "../../lib/search-params";
import type { UnifiedSearchResult } from "../../services/hybrid-search.server";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "../ui/popover";
import {
  Search,
  Gavel,
  MessageSquare,
  FileText,
  Mic,
  Calendar,
  ArrowUpDown,
  ChevronDown,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Type icon mapping
// ---------------------------------------------------------------------------

const TYPE_ICONS: Record<ContentType, React.ElementType> = {
  motion: Gavel,
  key_statement: MessageSquare,
  document_section: FileText,
  transcript_segment: Mic,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SearchFiltersProps {
  time: string;
  types: ContentType[];
  sort: string;
  onTimeChange: (time: string) => void;
  onTypesChange: (types: ContentType[]) => void;
  onSortChange: (sort: string) => void;
  results: UnifiedSearchResult[];
}

// ---------------------------------------------------------------------------
// SearchFilters component
// ---------------------------------------------------------------------------

export function SearchFilters({
  time,
  types,
  sort,
  onTimeChange,
  onTypesChange,
  onSortChange,
  results,
}: SearchFiltersProps) {
  const [timeOpen, setTimeOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const timeLabel =
    TIME_OPTIONS.find((o) => o.value === time)?.label ?? "Any time";
  const sortLabel =
    SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Relevance";

  // Count results by type (from unfiltered results)
  const typeCounts = results.reduce(
    (acc, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  // Type pill toggle handler
  function handleTypeToggle(type: ContentType) {
    if (types.includes(type)) {
      onTypesChange(types.filter((t) => t !== type));
    } else {
      onTypesChange([...types, type]);
    }
  }

  function handleAllClick() {
    onTypesChange([]);
  }

  const isAllActive = types.length === 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* All pill */}
      <button
        type="button"
        onClick={handleAllClick}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border",
          isAllActive
            ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm"
            : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300",
        )}
      >
        <Search
          className={cn(
            "h-3.5 w-3.5",
            isAllActive ? "text-blue-500" : "text-zinc-400",
          )}
        />
        All
        <span
          className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
            isAllActive
              ? "bg-blue-200 text-blue-800"
              : "bg-zinc-100 text-zinc-500",
          )}
        >
          {results.length}
        </span>
      </button>

      {/* Type pills */}
      {TYPE_OPTIONS.map(({ value, label }) => {
        const Icon = TYPE_ICONS[value];
        const count = typeCounts[value] || 0;
        const isActive = types.includes(value);

        return (
          <button
            key={value}
            type="button"
            onClick={() => handleTypeToggle(value)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border",
              isActive
                ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm"
                : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300",
            )}
          >
            <Icon
              className={cn(
                "h-3.5 w-3.5",
                isActive ? "text-blue-500" : "text-zinc-400",
              )}
            />
            {label}
            {count > 0 && (
              <span
                className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                  isActive
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

      {/* Spacer to push dropdowns right on wider screens */}
      <div className="flex-1 min-w-0" />

      {/* Time range dropdown */}
      <Popover open={timeOpen} onOpenChange={setTimeOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border",
              time
                ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm"
                : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300",
            )}
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>{timeLabel}</span>
            <ChevronDown className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-40 p-1 bg-white border border-zinc-200 rounded-xl shadow-lg"
        >
          {TIME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onTimeChange(opt.value);
                setTimeOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-xs font-medium rounded-lg transition-colors",
                time === opt.value
                  ? "bg-blue-50 text-blue-700"
                  : "text-zinc-600 hover:bg-zinc-50",
              )}
            >
              {opt.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Sort dropdown */}
      <Popover open={sortOpen} onOpenChange={setSortOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border",
              sort
                ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm"
                : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300",
            )}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            <span>{sortLabel}</span>
            <ChevronDown className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-40 p-1 bg-white border border-zinc-200 rounded-xl shadow-lg"
        >
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onSortChange(opt.value);
                setSortOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-xs font-medium rounded-lg transition-colors",
                sort === opt.value
                  ? "bg-blue-50 text-blue-700"
                  : "text-zinc-600 hover:bg-zinc-50",
              )}
            >
              {opt.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
