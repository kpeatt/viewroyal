import { useState, useMemo } from "react";
import {
  Search,
  User,
  Clock,
  Gavel,
  ArrowRight,
  ExternalLink
} from "lucide-react";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import { cn } from "../lib/utils";
import { Link } from "react-router";
import type { AgendaItem, Person } from "../lib/types";
import { SPEAKER_COLORS } from "../lib/colors";

interface ParticipantRecord {
  id: string | number;
  person_id: number | null;
  person?: Person;
  resolvedName: string;
  isVirtual?: boolean;
  group: "council" | "staff" | "others";
}

interface PeopleGridProps {
  attendanceGroups: {
    council: any[];
    staff: any[];
    others: any[];
  };
  speakerStats: {
    stats: Record<string, number>;
    totalTime: number;
  };
  getPersonRole: (person?: any) => string | null;
  agendaItems: AgendaItem[];
}

export function PeopleGrid({
  attendanceGroups,
  speakerStats,
  getPersonRole,
  agendaItems,
}: PeopleGridProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "council" | "staff" | "others">("all");

  // Flatten and normalize participants
  const allParticipants = useMemo(() => {
    const list: ParticipantRecord[] = [
      ...attendanceGroups.council.map((a) => ({ ...a, group: "council" as const })),
      ...attendanceGroups.staff.map((a) => ({ ...a, group: "staff" as const })),
      ...attendanceGroups.others.map((a) => ({ ...a, group: "others" as const })),
    ];
    return list;
  }, [attendanceGroups]);

  // Calculate motions per person
  const motionsByPerson = useMemo(() => {
    const counts: Record<number, number> = {};
    agendaItems.forEach((item) => {
      item.motions?.forEach((m) => {
        if (m.mover_id) counts[m.mover_id] = (counts[m.mover_id] || 0) + 1;
        if (m.seconder_id) counts[m.seconder_id] = (counts[m.seconder_id] || 0) + 1;
      });
    });
    return counts;
  }, [agendaItems]);

  const filteredParticipants = useMemo(() => {
    return allParticipants.filter((p) => {
      const matchesSearch = p.resolvedName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = activeFilter === "all" || p.group === activeFilter;
      return matchesSearch && matchesFilter;
    });
  }, [allParticipants, searchQuery, activeFilter]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  };

  // Sort participants by speaking time for the distribution bar
  const distributionData = useMemo(() => {
    return Object.entries(speakerStats.stats)
      .sort(([, a], [, b]) => b - a)
      .filter(([, time]) => time > 0);
  }, [speakerStats]);

  return (
    <div className="space-y-8">
      {/* Search & Filter Header */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-muted/30 p-4 rounded-xl border">
        <div className="relative w-full md:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search participants..."
            className="pl-9 bg-background"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-full md:w-auto overflow-x-auto">
          {(["all", "council", "staff", "others"] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={cn(
                "px-4 py-1.5 text-xs font-bold rounded-md transition-all capitalize whitespace-nowrap",
                activeFilter === filter
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Speaker Distribution Bar */}
      {speakerStats.totalTime > 0 && (
        <div className="space-y-3">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">
            Speaking Time Distribution
          </h3>
          <div className="flex h-8 w-full rounded-lg overflow-hidden border shadow-sm">
            {distributionData.map(([name, time], idx) => {
              const percent = (time / speakerStats.totalTime) * 100;
              if (percent < 1) return null; // Hide slivers
              return (
                <div
                  key={name}
                  className={cn(idx % 10 < 5 ? SPEAKER_COLORS[idx % 10] : SPEAKER_COLORS[idx % 10])}
                  style={{ width: `${percent}%` }}
                  title={`${name}: ${formatDuration(time)} (${percent.toFixed(1)}%)`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 px-1">
            {distributionData.slice(0, 5).map(([name, time], idx) => (
              <div key={name} className="flex items-center gap-1.5">
                <div className={cn("w-2 h-2 rounded-full", idx < 5 ? SPEAKER_COLORS[idx] : "")} />
                <span className="text-[10px] font-bold text-muted-foreground truncate max-w-[100px]">
                  {name}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground/60">
                  {((time / speakerStats.totalTime) * 100).toFixed(0)}%
                </span>
              </div>
            ))}
            {distributionData.length > 5 && (
              <span className="text-[10px] font-bold text-muted-foreground/40 italic">
                + {distributionData.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* People Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredParticipants.map((p) => {
          const role = getPersonRole(p.person);
          const time = speakerStats.stats[p.resolvedName] || 0;
          const percent = speakerStats.totalTime > 0 ? (time / speakerStats.totalTime) * 100 : 0;
          const motionCount = p.person_id ? motionsByPerson[p.person_id] || 0 : 0;

          return (
            <Card key={p.id} className="overflow-hidden hover:border-primary/30 transition-colors group">
              <CardContent className="p-5 flex flex-col h-full">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center shrink-0 border-2 border-background shadow-sm overflow-hidden">
                    {p.person?.image_url ? (
                      <img src={p.person.image_url} alt={p.resolvedName} className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-base truncate group-hover:text-primary transition-colors">
                      {p.resolvedName}
                    </h4>
                    <p className="text-xs text-muted-foreground font-semibold truncate">
                      {role || (p.group === "council" ? "Council Member" : p.group === "staff" ? "Staff" : "Public/Guest")}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-auto">
                  <div className="bg-muted/40 p-2 rounded-lg">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase mb-0.5">
                      <Clock className="w-3 h-3" />
                      Speaking
                    </div>
                    <div className="text-sm font-bold">
                      {formatDuration(time)}
                      <span className="text-[10px] text-muted-foreground ml-1.5 font-normal">
                        ({percent.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                  <div className="bg-muted/40 p-2 rounded-lg">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase mb-0.5">
                      <Gavel className="w-3 h-3" />
                      Motions
                    </div>
                    <div className="text-sm font-bold">
                      {motionCount}
                    </div>
                  </div>
                </div>

                {p.person_id && (
                  <Link
                    to={`/people/${p.person_id}`}
                    className="mt-4 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-primary/20 text-primary text-xs font-bold hover:bg-primary/5 transition-colors"
                  >
                    View Profile
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
