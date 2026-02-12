import { useState, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import type { Meeting } from "../lib/types";
import { cn, formatDate } from "../lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Video,
  FileText,
  MessageSquare,
} from "lucide-react";

interface CalendarViewProps {
  meetings: Meeting[];
}

export function CalendarView({ meetings }: CalendarViewProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlYear = parseInt(
    searchParams.get("year") || new Date().getFullYear().toString(),
  );

  // Track the current view date (month/year) for the calendar UI
  const [currentDate, setCurrentDate] = useState(
    new Date(urlYear, new Date().getMonth(), 1),
  );

  // Sync the calendar month when the URL year changes from the parent selector
  useEffect(() => {
    if (currentDate.getFullYear() !== urlYear) {
      setCurrentDate(new Date(urlYear, 0, 1));
    }
  }, [urlYear]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Calendar logic
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  const startingDayOfWeek = firstDayOfMonth.getDay();

  const calendarDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  }, [year, month, daysInMonth, startingDayOfWeek]);

  const updateYearParam = (newYear: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("year", newYear.toString());
    setSearchParams(newParams);
  };

  const nextMonth = () => {
    const nextDate = new Date(year, month + 1, 1);
    if (nextDate.getFullYear() !== year) {
      updateYearParam(nextDate.getFullYear());
    }
    setCurrentDate(nextDate);
  };

  const prevMonth = () => {
    const prevDate = new Date(year, month - 1, 1);
    if (prevDate.getFullYear() !== year) {
      updateYearParam(prevDate.getFullYear());
    }
    setCurrentDate(prevDate);
  };

  const today = () => {
    const now = new Date();
    if (now.getFullYear() !== year) {
      updateYearParam(now.getFullYear());
    }
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const getMeetingsForDay = (date: Date) => {
    const dateStr = date.toISOString().split("T")[0];
    return meetings.filter((m) => m.meeting_date === dateStr);
  };

  const isToday = (date: Date) => {
    const now = new Date();
    return (
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear()
    );
  };

  const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(
    currentDate,
  );

  const statusColors: Record<string, string> = {
    Scheduled: "bg-zinc-100 text-zinc-800 border-zinc-200 hover:bg-zinc-200",
    Planned: "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200",
    Occurred: "bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200",
    Completed:
      "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200",
    Cancelled:
      "bg-rose-100 text-rose-800 border-rose-200 line-through opacity-60 hover:bg-rose-200",
  };

  return (
    <div className="bg-white">
      {/* Calendar Navigation Header */}
      <div className="p-6 border-b border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-zinc-50/50">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-zinc-900 min-w-[200px]">
            {monthName}{" "}
            <span className="text-zinc-400 font-medium">{year}</span>
          </h2>
          <div className="flex items-center bg-white rounded-lg border border-zinc-200 p-1 shadow-sm">
            <button
              onClick={prevMonth}
              className="p-1.5 hover:bg-zinc-100 rounded-md transition-colors text-zinc-600"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={today}
              className="px-3 py-1 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-blue-600 transition-colors"
            >
              Today
            </button>
            <button
              onClick={nextMonth}
              className="p-1.5 hover:bg-zinc-100 rounded-md transition-colors text-zinc-600"
              aria-label="Next month"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-300" />
            Scheduled
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            Planned
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
            Occurred
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            Completed
          </div>
        </div>
      </div>

      {/* Calendar Grid Header */}
      <div className="grid grid-cols-7 border-b border-zinc-200">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div
            key={day}
            className="py-3 text-center text-[10px] font-black uppercase tracking-widest text-zinc-400 border-r border-zinc-100 last:border-r-0"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 auto-rows-[120px] sm:auto-rows-[140px]">
        {calendarDays.map((date, idx) => {
          if (!date) {
            return (
              <div
                key={`empty-${idx}`}
                className="bg-zinc-50/20 border-r border-b border-zinc-100"
              />
            );
          }

          const dayMeetings = getMeetingsForDay(date);
          const activeDay = isToday(date);

          return (
            <div
              key={date.toISOString()}
              className={cn(
                "p-2 border-r border-b border-zinc-100 relative group transition-colors hover:bg-zinc-50/30",
                activeDay && "bg-blue-50/30",
              )}
            >
              <span
                className={cn(
                  "text-xs font-black inline-flex items-center justify-center w-6 h-6 rounded-full mb-1",
                  activeDay
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-zinc-400",
                )}
              >
                {date.getDate()}
              </span>

              <div className="space-y-1 overflow-y-auto max-h-[calc(100%-32px)] no-scrollbar">
                {dayMeetings.map((meeting) => {
                  const isPast = new Date(meeting.meeting_date) < new Date();
                  const status =
                    meeting.status || (isPast ? "Completed" : "Planned");

                  return (
                    <Link
                      key={meeting.id}
                      to={`/meetings/${meeting.id}`}
                      className={cn(
                        "block p-1.5 rounded-md border text-[10px] font-bold transition-all shadow-sm truncate",
                        statusColors[status] ||
                          "bg-zinc-100 text-zinc-800 border-zinc-200",
                      )}
                      title={meeting.title}
                    >
                      <div className="flex items-center gap-1">
                        {meeting.organization?.name === "Council" && (
                          <div className="w-1 h-1 rounded-full bg-blue-500 shrink-0" />
                        )}
                        <span className="truncate">{meeting.title}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 opacity-60">
                        {meeting.has_transcript && (
                          <MessageSquare className="h-2.5 w-2.5" />
                        )}
                        {meeting.video_url && <Video className="h-2.5 w-2.5" />}
                        {meeting.has_agenda && (
                          <FileText className="h-2.5 w-2.5" />
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
        {/* End padding */}
        {Array.from({ length: (7 - (calendarDays.length % 7)) % 7 }).map(
          (_, i) => (
            <div
              key={`end-padding-${i}`}
              className="bg-zinc-50/20 border-r border-b border-zinc-100 last:border-r-0"
            />
          ),
        )}
      </div>
    </div>
  );
}
