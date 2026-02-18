import { Sparkles, Search } from "lucide-react";
import { cn } from "../../lib/utils";

interface SearchTabsProps {
  activeTab: "ai" | "results";
  onTabChange: (tab: "ai" | "results") => void;
  resultCount: number;
  hasAiAnswer: boolean;
}

export function SearchTabs({
  activeTab,
  onTabChange,
  resultCount,
  hasAiAnswer,
}: SearchTabsProps) {
  return (
    <div className="flex items-center gap-2 my-6">
      <button
        type="button"
        onClick={() => onTabChange("ai")}
        className={cn(
          "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all border",
          activeTab === "ai"
            ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm"
            : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300 hover:text-zinc-700",
        )}
      >
        <Sparkles className={cn("h-4 w-4", activeTab === "ai" ? "text-blue-500" : "text-zinc-400")} />
        AI Answer
        {hasAiAnswer && activeTab !== "ai" && (
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        )}
      </button>
      <button
        type="button"
        onClick={() => onTabChange("results")}
        className={cn(
          "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all border",
          activeTab === "results"
            ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm"
            : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300 hover:text-zinc-700",
        )}
      >
        <Search className={cn("h-4 w-4", activeTab === "results" ? "text-blue-500" : "text-zinc-400")} />
        Search Results
        {resultCount > 0 && (
          <span
            className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
              activeTab === "results"
                ? "bg-blue-200 text-blue-800"
                : "bg-zinc-100 text-zinc-500",
            )}
          >
            {resultCount}
          </span>
        )}
      </button>
    </div>
  );
}
