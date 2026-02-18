import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { cn } from "../../lib/utils";
import { TOPIC_ICONS, TOPIC_COLORS, type TopicName } from "../../lib/topic-utils";

// ── Types ──

interface SpeakingTimeCardProps {
  totalSeconds: number;
  meetingCount: number;
  segmentCount: number;
  trendData: { meeting_date: string; seconds_spoken: number }[];
  topicBreakdown: { topic: string; total_seconds: number }[];
  rank?: number;
  totalCouncillors?: number;
}

// ── Helpers ──

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1);
}

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Time Range Selector ──

const TIME_RANGES = [
  { value: "12m", label: "Last 12 months" },
  { value: "term", label: "Current term" },
  { value: "all", label: "All time" },
] as const;

function TimeRangeSelector({ current }: { current: string }) {
  const [searchParams] = useSearchParams();

  return (
    <div className="flex gap-1 bg-zinc-100 rounded-lg p-0.5">
      {TIME_RANGES.map((range) => {
        const params = new URLSearchParams(searchParams);
        if (range.value === "12m") {
          params.delete("timeRange");
        } else {
          params.set("timeRange", range.value);
        }
        const isActive = current === range.value;
        return (
          <Link
            key={range.value}
            to={`?${params.toString()}`}
            preventScrollReset
            className={cn(
              "px-2 py-1 text-[10px] font-bold rounded-md transition-colors",
              isActive
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700"
            )}
          >
            {range.label}
          </Link>
        );
      })}
    </div>
  );
}

// ── Sparkline SVG ──

function Sparkline({
  data,
  councilAvgSeconds,
}: {
  data: { meeting_date: string; seconds_spoken: number }[];
  councilAvgSeconds: number;
}) {
  const width = 280;
  const height = 80;
  const padding = { top: 8, right: 8, bottom: 8, left: 8 };

  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  if (data.length < 2) {
    return (
      <div className="h-20 flex items-center justify-center text-xs text-zinc-400 italic">
        Not enough meetings for trend
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.seconds_spoken), councilAvgSeconds);
  const safeMax = maxVal || 1;

  const points = data.map((d, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartW;
    const y = padding.top + chartH - (d.seconds_spoken / safeMax) * chartH;
    return { x, y, ...d };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  // Council average dashed line
  const avgY = padding.top + chartH - (councilAvgSeconds / safeMax) * chartH;
  const avgMinutes = Math.round(councilAvgSeconds / 60);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-20" preserveAspectRatio="none">
      {/* Council average line */}
      <line
        x1={padding.left}
        y1={avgY}
        x2={width - padding.right}
        y2={avgY}
        stroke="currentColor"
        strokeWidth="0.5"
        strokeDasharray="4 3"
        className="text-zinc-300"
      />
      <text
        x={width - padding.right}
        y={avgY - 3}
        textAnchor="end"
        className="fill-zinc-400"
        fontSize="6"
      >
        Avg: {avgMinutes}min
      </text>

      {/* Trend area fill */}
      <polygon
        points={`${points[0].x},${padding.top + chartH} ${polyline} ${points[points.length - 1].x},${padding.top + chartH}`}
        className="fill-blue-500/10"
      />

      {/* Trend line */}
      <polyline
        points={polyline}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-blue-500"
      />

      {/* Data point dots */}
      {points.map((p, i) => (
        <g key={i}>
          <circle
            cx={p.x}
            cy={p.y}
            r="2"
            className="fill-blue-500"
          />
          {/* Invisible larger hit target for hover */}
          <circle cx={p.x} cy={p.y} r="8" fill="transparent">
            <title>
              {new Date(p.meeting_date + "T00:00:00").toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}: {Math.round(p.seconds_spoken / 60)} min
            </title>
          </circle>
        </g>
      ))}
    </svg>
  );
}

// ── Topic Breakdown Bars ──

function TopicBreakdownBars({
  topics,
}: {
  topics: { topic: string; total_seconds: number }[];
}) {
  if (topics.length === 0) return null;

  const maxSeconds = Math.max(...topics.map((t) => t.total_seconds));

  return (
    <div className="space-y-3 mt-4">
      <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
        Time by Topic
      </div>
      {topics.map((t) => {
        const topicName = t.topic as TopicName;
        const Icon = TOPIC_ICONS[topicName];
        const colors = TOPIC_COLORS[topicName] || "text-zinc-400 bg-zinc-50 border-zinc-200";
        const pct = maxSeconds > 0 ? (t.total_seconds / maxSeconds) * 100 : 0;
        const textColorClass = colors.split(" ")[0]; // extract text-* class

        return (
          <div key={t.topic} className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className={cn("flex items-center gap-1.5 font-bold", textColorClass)}>
                {Icon && <Icon className="h-3 w-3" />}
                {t.topic}
              </span>
              <span className="font-bold text-zinc-600 tabular-nums">
                {formatHours(t.total_seconds)}h
              </span>
            </div>
            <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
              <div
                className={cn("h-full rounded-full opacity-70", textColorClass.replace("text-", "bg-"))}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ──

export function SpeakingTimeCard({
  totalSeconds,
  meetingCount,
  segmentCount,
  trendData,
  topicBreakdown,
  rank,
  totalCouncillors,
}: SpeakingTimeCardProps) {
  const [searchParams] = useSearchParams();
  const timeRange = searchParams.get("timeRange") || "12m";

  // Compute council average seconds per meeting from trend data
  const councilAvgSeconds = useMemo(() => {
    if (!trendData.length || !meetingCount) return 0;
    return totalSeconds / meetingCount;
  }, [totalSeconds, meetingCount, trendData.length]);

  return (
    <Card className="border-none shadow-md ring-1 ring-zinc-200/50 bg-white">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
            Speaking Time
          </CardTitle>
          <TimeRangeSelector current={timeRange} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Headline stat */}
        <div className="flex justify-between items-end">
          <div>
            <span className="text-4xl font-black text-zinc-900">
              {formatHours(totalSeconds)}
            </span>
            <span className="text-sm font-bold text-zinc-400 ml-1">hours</span>
          </div>
          <span className="text-xs font-bold text-zinc-500 mb-1">
            {meetingCount} Meetings
          </span>
        </div>

        {/* Ranking context */}
        {rank != null && totalCouncillors != null && (
          <p className="text-xs font-bold text-blue-600">
            {ordinalSuffix(rank)} most active speaker
            <span className="text-zinc-400 font-medium"> of {totalCouncillors}</span>
          </p>
        )}

        {/* Sparkline trend chart */}
        <Sparkline data={trendData} councilAvgSeconds={councilAvgSeconds} />

        {/* Topic breakdown */}
        <TopicBreakdownBars topics={topicBreakdown} />
      </CardContent>
    </Card>
  );
}
