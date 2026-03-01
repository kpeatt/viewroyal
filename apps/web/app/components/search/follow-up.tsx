import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";

interface FollowUpProps {
  suggestions: string[];
  onSelect: (q: string) => void;
  disabled: boolean;
}

export function FollowUp({ suggestions, onSelect, disabled }: FollowUpProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (suggestions.length === 0) return null;

  return (
    <div className="mt-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-600 transition-colors mb-1"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span>Related</span>
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
          <div className="flex flex-col gap-2 pt-1">
            {suggestions.map((q) => (
              <button
                key={q}
                onClick={() => onSelect(q)}
                disabled={disabled}
                className="w-full text-left px-4 py-2.5 bg-zinc-100 hover:bg-blue-50 hover:text-blue-700 rounded-xl text-sm text-zinc-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
