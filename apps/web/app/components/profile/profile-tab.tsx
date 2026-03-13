import { Sparkles, VoteIcon, Mic, Calendar, TrendingUp } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { cn, formatDate } from "../../lib/utils";
import type { CouncillorHighlights } from "../../services/profiling";

interface ProfileTabProps {
  highlights: CouncillorHighlights | null;
  attendanceRate: number;
  totalVotes: number;
  totalMoved: number;
  totalSeconded: number;
  hoursSpoken: number | null;
  speakingRank: number | undefined;
  totalCouncillors: number;
  topTopics: { name: string; percent: number }[];
}

export function ProfileTab({
  highlights,
  attendanceRate,
  totalVotes,
  totalMoved,
  totalSeconded,
  hoursSpoken,
  speakingRank,
  totalCouncillors,
  topTopics,
}: ProfileTabProps) {
  const narrative = highlights?.narrative;
  const overview = highlights?.overview;
  const displayText = narrative || overview;

  return (
    <div className="space-y-6">
      {/* AI Narrative */}
      {displayText && (
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-4">
            {displayText.split("\n\n").map((paragraph, i) => (
              <p key={i} className="text-sm text-zinc-700 leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>

          {/* Disclaimer */}
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-medium">
            <Sparkles className="h-3 w-3 text-amber-400" />
            <span>
              AI-generated profile
              {highlights?.narrative_generated_at
                ? ` - Updated ${formatDate(highlights.narrative_generated_at)}`
                : highlights?.generated_at
                  ? ` - Updated ${formatDate(highlights.generated_at)}`
                  : ""}
            </span>
          </div>
        </div>
      )}

      {/* At-a-glance stats card */}
      <Card className="border-none shadow-md ring-1 ring-zinc-200/50 bg-white">
        <CardContent className="pt-6">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400 mb-4">
            At a Glance
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatItem
              icon={VoteIcon}
              label="Total Votes"
              value={totalVotes.toLocaleString()}
            />
            <StatItem
              icon={Calendar}
              label="Attendance"
              value={`${attendanceRate}%`}
            />
            <StatItem
              icon={Mic}
              label="Hours Spoken"
              value={hoursSpoken !== null ? hoursSpoken.toFixed(1) : "--"}
              subtext={speakingRank ? `#${speakingRank} of ${totalCouncillors}` : undefined}
            />
            <StatItem
              icon={TrendingUp}
              label="Proposals"
              value={(totalMoved + totalSeconded).toLocaleString()}
              subtext={`${totalMoved} moved, ${totalSeconded} seconded`}
            />
          </div>

          {/* Top topics */}
          {topTopics.length > 0 && (
            <div className="mt-6 pt-4 border-t border-zinc-100">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-3">
                Top Topics by Engagement
              </h4>
              <div className="flex flex-wrap gap-2">
                {topTopics.map((topic) => (
                  <div
                    key={topic.name}
                    className="flex items-center gap-1.5 bg-zinc-50 border border-zinc-200 rounded-full px-3 py-1"
                  >
                    <span className="text-xs font-bold text-zinc-700">{topic.name}</span>
                    <span className="text-[10px] font-bold text-zinc-400">{topic.percent}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Stat Item ──

function StatItem({
  icon: Icon,
  label,
  value,
  subtext,
}: {
  icon: typeof VoteIcon;
  label: string;
  value: string;
  subtext?: string;
}) {
  return (
    <div className="text-center space-y-1">
      <Icon className="h-4 w-4 text-zinc-400 mx-auto" />
      <div className="text-xl font-black text-zinc-900">{value}</div>
      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">{label}</div>
      {subtext && (
        <div className="text-[10px] text-zinc-400">{subtext}</div>
      )}
    </div>
  );
}
