import { Link } from "react-router";
import {
  PlayCircle,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { formatDate } from "../../lib/utils";

interface RecentMeetingSectionProps {
  meeting: any;
  stats: {
    agendaItems: number;
    totalMotions: number;
    motionsPassed: number;
    dividedVotes: number;
    duration: number | null;
  };
  decisions: Array<{ id: number; summary: string; result: string }>;
}

export function RecentMeetingSection({
  meeting,
  stats,
  decisions,
}: RecentMeetingSectionProps) {
  if (!meeting) return null;

  return (
    <section>
      <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
        <PlayCircle className="h-4 w-4" />
        Latest Meeting
      </h2>

      <Link
        to={`/meetings/${meeting.id}`}
        className="block bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden p-6 hover:border-blue-200 hover:shadow-md transition-all group"
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-0 text-[10px]">
            {meeting.type || "Council Meeting"}
          </Badge>
        </div>
        <h3 className="text-lg font-bold text-zinc-900 mb-1 group-hover:text-blue-600 transition-colors">
          {meeting.title}
        </h3>
        <div className="flex items-center gap-3 text-sm text-zinc-500 mb-4">
          <div className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {formatDate(meeting.meeting_date)}
          </div>
          {stats.duration != null && stats.duration > 0 && (
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {Math.floor(stats.duration / 60)}h {stats.duration % 60}m
            </div>
          )}
        </div>

        {/* AI Summary */}
        {meeting.summary && (
          <p className="text-sm text-zinc-600 leading-relaxed mb-4">
            {meeting.summary}
          </p>
        )}

        {/* Key Decisions */}
        {decisions.length > 0 && (
          <div className="mb-4 p-4 bg-zinc-50 rounded-xl">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
              Key Decisions
            </h4>
            <ul className="space-y-2">
              {decisions.map((decision) => (
                <li
                  key={decision.id}
                  className="flex items-start gap-2 text-sm"
                >
                  {decision.result === "CARRIED" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  )}
                  <span className="text-zinc-700 line-clamp-2">
                    {decision.summary}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Stats Row */}
        {(stats.agendaItems > 0 || stats.totalMotions > 0) && (
          <div className="flex gap-6 mb-4 pb-4 border-b border-zinc-100">
            {stats.agendaItems > 0 && (
              <div>
                <div className="text-2xl font-bold text-zinc-900">
                  {stats.agendaItems}
                </div>
                <div className="text-xs text-zinc-500">Agenda Items</div>
              </div>
            )}
            {stats.totalMotions > 0 && (
              <div>
                <div className="text-2xl font-bold text-zinc-900">
                  {stats.motionsPassed}
                  <span className="text-sm font-normal text-zinc-400">
                    /{stats.totalMotions}
                  </span>
                </div>
                <div className="text-xs text-zinc-500">Motions Passed</div>
              </div>
            )}
            {stats.dividedVotes > 0 && (
              <div>
                <div className="text-2xl font-bold text-zinc-900">
                  {stats.dividedVotes}
                </div>
                <div className="text-xs text-zinc-500">Divided Votes</div>
              </div>
            )}
          </div>
        )}

        {/* CTA */}
        <div className="inline-flex items-center gap-2 text-blue-600 font-semibold group-hover:text-blue-700 transition-colors">
          View Full Meeting Details
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </div>
      </Link>
    </section>
  );
}
