import { useState } from "react";
import { FileText, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";
import type { DocumentSection } from "../../lib/types";

interface DocumentSectionsProps {
  sections: DocumentSection[];
}

export function DocumentSections({ sections }: DocumentSectionsProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (sections.length === 0) return null;

  return (
    <div className="space-y-1">
      <h4 className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
        <FileText className="w-3 h-3 text-indigo-500" />
        Document Sections ({sections.length})
      </h4>
      <div className="pl-5 space-y-1">
        {sections.map((section) => (
          <div
            key={section.id}
            className="border border-zinc-100 rounded-lg overflow-hidden"
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpandedId(expandedId === section.id ? null : section.id);
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-zinc-50 transition-colors"
            >
              <span className="text-sm font-medium text-zinc-700 truncate pr-2">
                {section.section_title || `Section ${section.section_order}`}
              </span>
              <ChevronDown
                className={cn(
                  "w-4 h-4 text-zinc-400 flex-shrink-0 transition-transform",
                  expandedId === section.id && "rotate-180",
                )}
              />
            </button>
            <div
              className={cn(
                "grid transition-all duration-200 ease-in-out",
                expandedId === section.id
                  ? "grid-rows-[1fr]"
                  : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <div className="px-3 pb-3 border-t border-zinc-100">
                  <p className="text-sm text-zinc-600 leading-relaxed whitespace-pre-line mt-2">
                    {section.section_text}
                  </p>
                  {section.page_start != null && (
                    <span className="text-[10px] text-zinc-400 mt-2 block">
                      Page {section.page_start}
                      {section.page_end &&
                      section.page_end !== section.page_start
                        ? `\u2013${section.page_end}`
                        : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
