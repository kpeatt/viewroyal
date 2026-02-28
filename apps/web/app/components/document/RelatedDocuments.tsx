import { Link } from "react-router";
import { BookOpen, ArrowRight } from "lucide-react";
import type { CrossReference } from "../../lib/cross-references";

interface RelatedDocumentsProps {
  crossReferences: CrossReference[];
}

export function RelatedDocuments({ crossReferences }: RelatedDocumentsProps) {
  if (crossReferences.length === 0) return null;

  return (
    <div className="mt-10">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="w-4 h-4 text-zinc-400" />
        <h2 className="text-sm font-semibold text-zinc-700">
          Related Documents
        </h2>
        <span className="text-xs text-zinc-400">
          ({crossReferences.length})
        </span>
      </div>

      <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg overflow-hidden">
        {crossReferences.map((ref) => (
          <Link
            key={ref.targetId}
            to={ref.targetUrl}
            className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors group no-underline"
          >
            <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-800 truncate">
                {ref.targetTitle}
              </p>
              <p className="text-xs text-zinc-500">
                {ref.pattern} &middot; Referenced in{" "}
                {ref.sectionOrders.length} section
                {ref.sectionOrders.length !== 1 ? "s" : ""}
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 shrink-0 transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  );
}
