import { Link } from "react-router";
import { Calendar, ArrowRight } from "lucide-react";
import { Badge } from "../ui/badge";
import { formatDate } from "../../lib/utils";

interface UpcomingMeetingSectionProps {
  meeting: {
    id: number;
    title: string;
    meeting_date: string;
    type?: string;
    has_agenda?: boolean;
    agendaPreview: string[];
    organizations?: { name: string };
  } | null;
}

export function UpcomingMeetingSection({
  meeting,
}: UpcomingMeetingSectionProps) {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Upcoming Meeting
        </h2>
        <Link
          to="/meetings"
          className="text-xs text-blue-600 hover:underline font-semibold"
        >
          View all
        </Link>
      </div>

      {!meeting ? (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 text-center">
          <p className="text-sm text-zinc-500">No meetings scheduled</p>
        </div>
      ) : (
        <Link
          to={`/meetings/${meeting.id}`}
          className="block bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 hover:border-blue-200 hover:shadow-md transition-all group"
        >
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-0 text-[10px]">
              {meeting.type || "Council Meeting"}
            </Badge>
          </div>
          <h3 className="text-lg font-bold text-zinc-900 mb-1 group-hover:text-blue-600 transition-colors">
            {meeting.title}
          </h3>
          <p className="text-sm text-zinc-500 mb-3">
            {formatDate(meeting.meeting_date)}
          </p>

          {meeting.agendaPreview?.length > 0 ? (
            <div className="border-t border-zinc-100 pt-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                Agenda Preview
              </h4>
              <ul className="space-y-1">
                {meeting.agendaPreview.map((title, i) => (
                  <li
                    key={i}
                    className="text-sm text-zinc-600 line-clamp-1 flex items-start gap-2"
                  >
                    <span className="text-zinc-300 mt-1.5 shrink-0 w-1 h-1 rounded-full bg-zinc-300" />
                    {title}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            !meeting.has_agenda && (
              <p className="text-xs text-zinc-400 italic border-t border-zinc-100 pt-3">
                Agenda not yet available
              </p>
            )
          )}

          <div className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 font-semibold group-hover:text-blue-700 transition-colors">
            View meeting
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>
      )}
    </section>
  );
}
