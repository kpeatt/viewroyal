import { Link } from "react-router";
import { Gavel } from "lucide-react";
import { Badge } from "../ui/badge";
import { formatDate } from "../../lib/utils";
import { SubscribeButton } from "../subscribe-button";

interface ActiveMattersSectionProps {
  matters: Array<{
    id: number;
    title: string;
    category?: string;
    first_seen?: string;
    last_seen?: string;
    summary?: string | null;
  }>;
}

export function ActiveMattersSection({ matters }: ActiveMattersSectionProps) {
  if (matters.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
          <Gavel className="h-4 w-4" />
          Active Matters
        </h2>
        <Link
          to="/matters"
          className="text-xs text-blue-600 hover:underline font-semibold"
        >
          View all
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {matters.map((matter) => {
          const isNew = matter.first_seen === matter.last_seen;
          return (
            <div
              key={matter.id}
              className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 hover:border-blue-200 hover:shadow-md transition-all flex flex-col"
            >
              <Link to={`/matters/${matter.id}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {matter.category || "General"}
                  </Badge>
                  {isNew ? (
                    <span className="text-[10px] font-semibold text-blue-600">
                      New
                    </span>
                  ) : (
                    matter.first_seen && (
                      <span className="text-[10px] text-zinc-400">
                        Since {formatDate(matter.first_seen)}
                      </span>
                    )
                  )}
                </div>
                <h3 className="text-sm font-bold text-zinc-900 line-clamp-2 mb-1">
                  {matter.title}
                </h3>
                {matter.summary && (
                  <p className="text-xs text-zinc-500 line-clamp-1 mb-2">
                    {matter.summary}
                  </p>
                )}
                {matter.last_seen && (
                  <p className="text-[10px] text-zinc-400">
                    Last discussed {formatDate(matter.last_seen)}
                  </p>
                )}
              </Link>
              <div className="mt-3 pt-3 border-t border-zinc-100">
                <SubscribeButton
                  type="matter"
                  targetId={matter.id}
                  compact
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
