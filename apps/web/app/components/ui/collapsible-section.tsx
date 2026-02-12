import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";
import type { LucideIcon } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  icon: LucideIcon;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  className?: string;
  headerClassName?: string;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = false,
  badge,
  className,
  headerClassName,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      className={cn(
        "bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden",
        className
      )}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full p-6 flex items-center justify-between text-left transition-colors hover:bg-zinc-50",
          headerClassName
        )}
      >
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-blue-600" />
          <h2 className="text-xl font-bold text-zinc-900">{title}</h2>
          {badge}
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-zinc-400 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>

      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-zinc-100">{children}</div>
        </div>
      </div>
    </div>
  );
}
