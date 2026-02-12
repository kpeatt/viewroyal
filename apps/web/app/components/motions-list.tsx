import { useState, useMemo } from "react";
import { Search, Gavel, CheckCircle2, XCircle } from "lucide-react";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";
import type { AgendaItem, Motion } from "../lib/types";
import { MotionCard } from "./motion-card";

interface MotionsListProps {
  agendaItems: AgendaItem[];
  onWatchVideo?: (seconds: number) => void;
}

/**
 * MotionsList provides a filtered, dedicated view of all motions across a meeting.
 * It flattens the motions from all agenda items and provides filtering by result (Carried/Defeated).
 */
export function MotionsList({ agendaItems, onWatchVideo }: MotionsListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | "CARRIED" | "DEFEATED">("ALL");

  const allMotions = useMemo(() => {
    const motions: (Motion & { agendaItemTitle: string; agendaItemOrder: string })[] = [];
    agendaItems.forEach((item) => {
      if (item.motions) {
        item.motions.forEach((motion) => {
          motions.push({
            ...motion,
            agendaItemTitle: item.title,
            agendaItemOrder: item.item_order || "",
          });
        });
      }
    });
    return motions;
  }, [agendaItems]);

  const filteredMotions = useMemo(() => {
    return allMotions.filter((m) => {
      const matchesSearch =
        m.text_content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.agendaItemTitle.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filter === "ALL" || m.result === filter;
      return matchesSearch && matchesFilter;
    });
  }, [allMotions, searchQuery, filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-muted/30 p-4 rounded-xl border">
        <div className="relative w-full md:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search motions or items..."
            className="pl-9 bg-background"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-full md:w-auto">
          <button
            onClick={() => setFilter("ALL")}
            className={cn(
              "px-3 py-1.5 text-xs font-bold rounded-md transition-all flex-1 md:flex-none",
              filter === "ALL" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            All
          </button>
          <button
            onClick={() => setFilter("CARRIED")}
            className={cn(
              "px-3 py-1.5 text-xs font-bold rounded-md transition-all flex-1 md:flex-none flex items-center justify-center gap-1.5",
              filter === "CARRIED"
                ? "bg-green-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <CheckCircle2 className="w-3 h-3" />
            Carried
          </button>
          <button
            onClick={() => setFilter("DEFEATED")}
            className={cn(
              "px-3 py-1.5 text-xs font-bold rounded-md transition-all flex-1 md:flex-none flex items-center justify-center gap-1.5",
              filter === "DEFEATED"
                ? "bg-red-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <XCircle className="w-3 h-3" />
            Defeated
          </button>
        </div>
      </div>

      <div className="grid gap-8">
        {filteredMotions.length > 0 ? (
          filteredMotions.map((motion) => (
            <div key={motion.id} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Badge variant="outline" className="text-[10px] font-mono h-5 font-bold">
                  Item {motion.agendaItemOrder}
                </Badge>
                <span className="text-[11px] text-muted-foreground font-bold truncate">
                  {motion.agendaItemTitle}
                </span>
              </div>
              <MotionCard motion={motion} onWatchVideo={onWatchVideo} />
            </div>
          ))
        ) : (
          <div className="py-20 text-center border-2 border-dashed rounded-2xl bg-muted/20">
            <Gavel className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground">No motions found</h3>
            <p className="text-sm text-muted-foreground/60">Try adjusting your search or filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}
