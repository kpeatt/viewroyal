import { getHomeData } from "../services/site";
import { createSupabaseServerClient } from "../lib/supabase.server";
import { Link } from "react-router";
import {
  Calendar,
  Users,
  ArrowRight,
  Clock,
  ChevronRight,
  Gavel,
  CheckCircle2,
  XCircle,
  PlayCircle,
  Bell,
  History as HistoryIcon,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { formatDate } from "../lib/utils";
import { AskQuestion } from "../components/ask-question";
import { MeetingListRow } from "../components/meeting/meeting-list-row";

export async function loader({ request }: { request: Request }) {
  try {
    const { supabase } = createSupabaseServerClient(request);
    const data = await getHomeData(supabase);

    return {
      ...data,
    };
  } catch (error) {
    console.error("Error loading home data:", error);
    throw new Response("Error loading dashboard", { status: 500 });
  }
}

export default function Home({ loaderData }: any) {
  const {
    latestMeeting,
    latestMeetingStats,
    keyDecisions,
    upcomingMeetings,
    recentMeetings,
    councilMembers,
    publicNotices,
  } = loaderData;

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Hero Section with Ask Interface */}
      <div className="bg-gradient-to-b from-blue-600 to-blue-700 text-white">
        <div className="container mx-auto px-4 py-16 max-w-5xl">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
              What's happening in View Royal?
            </h1>
            <p className="text-blue-100 text-lg max-w-2xl mx-auto">
              Explore council meetings, decisions, and debates. Get instant
              answers analyzed from official records and transcripts.
            </p>
          </div>

          {/* Prominent Ask Interface */}
          <div className="max-w-5xl mx-auto">
            <AskQuestion
              title=""
              placeholder="Ask anything about View Royal council decisions..."
              className="bg-white text-zinc-900 shadow-2xl border-0"
            />
          </div>
        </div>
      </div>

      <div className="container mx-auto py-12 px-4 max-w-6xl">
        {/* Latest Meeting Section */}
        {latestMeeting && (
          <section className="mb-12">
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
              <PlayCircle className="h-4 w-4" />
              Latest Meeting
            </h2>
            <Link
              to={`/meetings/${latestMeeting.id}`}
              className="block bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden p-6 hover:border-blue-200 hover:shadow-md transition-all group"
            >
              {/* Header */}
              <div className="flex items-start gap-4 mb-5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-0 text-[10px]">
                      {latestMeeting.type || "Council Meeting"}
                    </Badge>
                  </div>
                  <h3 className="text-lg font-bold text-zinc-900 mb-1">
                    {latestMeeting.title}
                  </h3>
                  <div className="flex items-center gap-3 text-sm text-zinc-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(latestMeeting.meeting_date)}
                    </div>
                    {latestMeetingStats?.duration && (
                      <div className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {Math.floor(latestMeetingStats.duration / 60)}h{" "}
                        {latestMeetingStats.duration % 60}m
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Summary */}
              {latestMeeting.summary && (
                <div className="mb-5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                    Summary
                  </h4>
                  <p className="text-sm text-zinc-600 leading-relaxed">
                    {latestMeeting.summary}
                  </p>
                </div>
              )}

              {/* Key Decisions */}
              {keyDecisions.length > 0 && (
                <div className="mb-5 p-4 bg-zinc-50 rounded-xl">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
                    Key Decisions
                  </h4>
                  <ul className="space-y-2">
                    {keyDecisions.map((decision: any) => (
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

              {/* Stats row */}
              {(latestMeetingStats?.agendaItems > 0 ||
                latestMeetingStats?.totalMotions > 0) && (
                <div className="flex gap-6 mb-5 pb-5 border-b border-zinc-100">
                  {latestMeetingStats.agendaItems > 0 && (
                    <div>
                      <div className="text-2xl font-bold text-zinc-900">
                        {latestMeetingStats.agendaItems}
                      </div>
                      <div className="text-xs text-zinc-500">Agenda Items</div>
                    </div>
                  )}
                  {latestMeetingStats.totalMotions > 0 && (
                    <div>
                      <div className="text-2xl font-bold text-zinc-900">
                        {latestMeetingStats.motionsPassed}
                        <span className="text-sm font-normal text-zinc-400">
                          /{latestMeetingStats.totalMotions}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500">
                        Motions Passed
                      </div>
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
        )}

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-7 space-y-8">
            {/* Recent Meetings */}
            <section>
              <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <HistoryIcon className="h-4 w-4" />
                  Recent Meetings
                </span>
                <Link
                  to="/meetings"
                  className="text-[10px] text-blue-600 hover:underline font-semibold"
                >
                  View All
                </Link>
              </h2>
              <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden divide-y divide-zinc-100">
                {recentMeetings.map((meeting: any) => (
                  <MeetingListRow key={meeting.id} meeting={meeting} />
                ))}
              </div>
            </section>
            {/* Upcoming Meetings */}
            <section>
              <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Upcoming Meetings
              </h2>
              {upcomingMeetings.length > 0 ? (
                <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden divide-y divide-zinc-100">
                  {upcomingMeetings.map((meeting: any) => (
                    <MeetingListRow
                      key={meeting.id}
                      meeting={meeting}
                      showDateIcon
                    />
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8 text-center text-zinc-500">
                  No upcoming meetings scheduled.
                </div>
              )}
            </section>
          </div>

          {/* Right Column - Council Members */}
          <div className="lg:col-span-5 space-y-8">
            <section>
              <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Your Council
                </span>
                <Link
                  to="/people"
                  className="text-[10px] text-blue-600 hover:underline font-semibold"
                >
                  View All
                </Link>
              </h2>
              <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
                {/* Mayor - Featured */}
                {councilMembers[0] && councilMembers[0].role === "Mayor" && (
                  <Link
                    to={`/people/${councilMembers[0].id}`}
                    className="flex items-center gap-4 p-5 bg-gradient-to-r from-blue-50 to-white border-b border-zinc-100 hover:from-blue-100 transition-colors group"
                  >
                    <div className="h-16 w-16 rounded-full bg-zinc-100 border-2 border-blue-200 overflow-hidden shrink-0">
                      {councilMembers[0].image_url ? (
                        <img
                          src={councilMembers[0].image_url}
                          alt={councilMembers[0].name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-zinc-300">
                          <Users className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-lg font-bold text-zinc-900 group-hover:text-blue-600 transition-colors">
                        {councilMembers[0].name}
                      </div>
                      <Badge
                        variant="secondary"
                        className="bg-blue-100 text-blue-700 border-0"
                      >
                        Mayor
                      </Badge>
                    </div>
                    <ChevronRight className="h-5 w-5 text-zinc-300 group-hover:text-blue-600 transition-colors" />
                  </Link>
                )}

                {/* Councillors Grid */}
                <div className="grid grid-cols-2 divide-x divide-zinc-100">
                  {councilMembers.slice(1).map((person: any, i: number) => (
                    <Link
                      key={person.id}
                      to={`/people/${person.id}`}
                      className={`flex flex-col items-center gap-2 p-4 hover:bg-zinc-50 transition-colors group ${
                        i % 2 === 0 && i === councilMembers.length - 2
                          ? "col-span-2"
                          : ""
                      } ${i >= 2 ? "border-t border-zinc-100" : ""}`}
                    >
                      <div className="h-12 w-12 rounded-full bg-zinc-100 border border-zinc-200 overflow-hidden">
                        {person.image_url ? (
                          <img
                            src={person.image_url}
                            alt={person.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-zinc-300">
                            <Users className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-semibold text-zinc-900 group-hover:text-blue-600 transition-colors">
                          {person.name}
                        </div>
                        <div className="text-[10px] text-zinc-400 uppercase tracking-wider">
                          Councillor
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </section>

            {/* Public Notices */}
            {publicNotices && publicNotices.length > 0 && (
              <section>
                <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Public Notices
                </h2>
                <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden divide-y divide-zinc-100">
                  {publicNotices.map((notice: any, i: number) => (
                    <a
                      key={i}
                      href={notice.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-4 p-4 hover:bg-zinc-50 transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-zinc-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                          {notice.title}
                        </div>
                        <div className="text-xs text-zinc-500 mt-1">
                          {new Date(notice.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-zinc-300 group-hover:text-blue-600 transition-colors shrink-0 self-center" />
                    </a>
                  ))}
                  <a
                    href="https://www.viewroyal.ca/EN/main/town/public.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 p-3 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    View All Notices
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
