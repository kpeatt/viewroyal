import { Link } from "react-router";
import { ChevronRight, Calendar } from "lucide-react";
import { formatDate, cn } from "../../lib/utils";

interface MeetingListRowProps {
  meeting: {
    id: number | string;
    title: string;
    meeting_date: string;
    type?: string;
    has_agenda?: boolean;
    agenda_url?: string;
    has_transcript?: boolean;
    has_minutes?: boolean;
  };
  showDateIcon?: boolean;
  className?: string;
}

export function MeetingListRow({
  meeting,
  showDateIcon = false,
  className,
}: MeetingListRowProps) {
  const hasContent = !!(
    meeting.has_agenda ||
    meeting.agenda_url ||
    meeting.has_transcript ||
    meeting.has_minutes
  );
  const Wrapper = hasContent ? Link : "div";
  const wrapperProps = hasContent ? { to: `/meetings/${meeting.id}` } : {};

  return (
    <Wrapper
      {...(wrapperProps as any)}
      className={cn(
        "flex items-center gap-4 p-4 transition-colors",
        hasContent ? "hover:bg-zinc-50 group cursor-pointer" : "opacity-80",
        className,
      )}
    >
      {showDateIcon ? (
        <div className="w-14 h-14 rounded-xl bg-blue-50 border border-blue-100 flex flex-col items-center justify-center shrink-0">
          <span className="text-xs font-bold uppercase text-blue-600">
            {formatDate(meeting.meeting_date, { month: "short" })}
          </span>
          <span className="text-lg font-black text-blue-700">
            {formatDate(meeting.meeting_date, { day: "numeric" })}
          </span>
        </div>
      ) : (
        <div className="p-2 bg-zinc-50 rounded-lg shrink-0 text-zinc-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
          <Calendar className="h-5 w-5" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "font-semibold text-zinc-900 transition-colors truncate",
            hasContent && "group-hover:text-blue-600",
          )}
        >
          {meeting.title}
        </div>
        <div className="text-sm text-zinc-500 flex items-center gap-2">
          {showDateIcon ? (
            <span>{meeting.type || "Council Meeting"}</span>
          ) : (
            <span>{formatDate(meeting.meeting_date)}</span>
          )}
          {!hasContent && (
            <span className="text-xs text-zinc-400 italic">
              (Agenda pending)
            </span>
          )}
        </div>
      </div>

      {hasContent && (
        <ChevronRight className="h-5 w-5 text-zinc-300 group-hover:text-blue-600 transition-colors shrink-0" />
      )}
    </Wrapper>
  );
}
