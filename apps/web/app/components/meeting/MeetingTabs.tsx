import { FileText, Gavel, Users, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import type {
  Meeting,
  AgendaItem,
  TranscriptSegment,
  Person,
} from "../../lib/types";

export type MeetingTabId = "overview" | "agenda" | "motions" | "participants";

interface MeetingTabsProps {
  meeting: Meeting;
  agendaItems: AgendaItem[];
  transcript: TranscriptSegment[];
  participantCount: number;
  activeTab: MeetingTabId;
  onTabChange: (tab: MeetingTabId) => void;
}

export function MeetingTabs({
  meeting,
  agendaItems,
  transcript,
  participantCount,
  activeTab,
  onTabChange,
}: MeetingTabsProps) {
  // Calculate stats
  const durationSeconds =
    meeting.video_duration_seconds ||
    (transcript.length > 0 ? transcript[transcript.length - 1].end_time : 0);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const allMotions = agendaItems.flatMap((item) => item.motions || []);
  const carriedCount = allMotions.filter((m) => m.result === "CARRIED").length;
  const defeatedCount = allMotions.filter(
    (m) => m.result === "DEFEATED",
  ).length;

  const keyDecisionCount = allMotions.filter(
    (m) => m.result && m.disposition !== "Procedural",
  ).length;

  const tabs = [
    {
      id: "overview" as MeetingTabId,
      icon: Sparkles,
      label: "Overview",
      value: keyDecisionCount > 0 ? keyDecisionCount.toString() : "—",
      subValue: keyDecisionCount > 0 ? "key decisions" : "summary",
      color: "blue",
    },
    {
      id: "agenda" as MeetingTabId,
      icon: FileText,
      label: "Agenda",
      value: agendaItems.length.toString(),
      subValue:
        agendaItems.filter((i) => i.is_controversial).length > 0
          ? `${agendaItems.filter((i) => i.is_controversial).length} notable`
          : undefined,
      color: "emerald",
    },
    {
      id: "motions" as MeetingTabId,
      icon: Gavel,
      label: "Motions",
      value: allMotions.length.toString(),
      subValue:
        allMotions.length > 0
          ? `${carriedCount} carried${defeatedCount > 0 ? `, ${defeatedCount} defeated` : ""}`
          : undefined,
      color: "amber",
    },
    {
      id: "participants" as MeetingTabId,
      icon: Users,
      label: "Participants",
      value: participantCount.toString(),
      color: "violet",
    },
  ];

  const colorClasses = {
    blue: {
      active: "bg-blue-600 text-white border-blue-600",
      inactive:
        "bg-white text-zinc-600 border-zinc-200 hover:border-blue-300 hover:bg-blue-50",
      icon: "text-blue-600",
      iconActive: "text-white",
    },
    emerald: {
      active: "bg-emerald-600 text-white border-emerald-600",
      inactive:
        "bg-white text-zinc-600 border-zinc-200 hover:border-emerald-300 hover:bg-emerald-50",
      icon: "text-emerald-600",
      iconActive: "text-white",
    },
    amber: {
      active: "bg-amber-600 text-white border-amber-600",
      inactive:
        "bg-white text-zinc-600 border-zinc-200 hover:border-amber-300 hover:bg-amber-50",
      icon: "text-amber-600",
      iconActive: "text-white",
    },
    violet: {
      active: "bg-violet-600 text-white border-violet-600",
      inactive:
        "bg-white text-zinc-600 border-zinc-200 hover:border-violet-300 hover:bg-violet-50",
      icon: "text-violet-600",
      iconActive: "text-white",
    },
  };

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
      <div className="grid grid-cols-2 sm:grid-cols-4">
        {tabs.map((tab, idx) => {
          const isActive = activeTab === tab.id;
          const colors = colorClasses[tab.color as keyof typeof colorClasses];

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "relative p-3 sm:p-5 text-left transition-all border-b-4",
                // Vertical dividers: on mobile (2-col), right border on left column; on sm+ (4-col), all but last
                idx % 2 === 0 && "border-r border-r-zinc-100",
                "sm:border-r sm:border-r-zinc-100 sm:last:border-r-0",
                // Top border between rows on mobile
                idx >= 2 && "border-t border-t-zinc-100 sm:border-t-0",
                isActive ? colors.active : colors.inactive,
                "focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500",
              )}
            >
              {/* Active indicator */}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/30" />
              )}

              <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                <tab.icon
                  className={cn(
                    "h-4 w-4 sm:h-5 sm:w-5",
                    isActive ? colors.iconActive : colors.icon,
                  )}
                />
                <span
                  className={cn(
                    "text-xs sm:text-sm font-bold uppercase tracking-wide",
                    isActive ? "text-white/90" : "text-zinc-400",
                  )}
                >
                  {tab.label}
                </span>
              </div>

              <div
                className={cn(
                  "text-2xl sm:text-3xl font-bold",
                  isActive ? "text-white" : "text-zinc-900",
                )}
              >
                {tab.value}
              </div>

              {tab.subValue && (
                <div
                  className={cn(
                    "text-[10px] sm:text-xs mt-1 truncate",
                    isActive ? "text-white/70" : "text-zinc-500",
                  )}
                >
                  {tab.subValue}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
