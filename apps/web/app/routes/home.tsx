import { getHomeData } from "../services/site";
import { createSupabaseServerClient } from "../lib/supabase.server";
import { getMunicipality } from "../services/municipality";
import { Link } from "react-router";
import type { Municipality } from "../lib/types";
import {
  Calendar,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  PlayCircle,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { formatDate } from "../lib/utils";
import { AskQuestion } from "../components/ask-question";

export async function loader({ request }: { request: Request }) {
  try {
    const { supabase } = createSupabaseServerClient(request);
    const municipality = await getMunicipality(supabase);
    const data = await getHomeData(supabase);

    return {
      ...data,
      municipality,
    };
  } catch (error) {
    console.error("Error loading home data:", error);
    throw new Response("Error loading dashboard", { status: 500 });
  }
}

export default function Home({ loaderData }: any) {
  const {
    upcomingMeeting,
    recentMeeting,
    recentMeetingStats,
    recentMeetingDecisions,
    activeMatters,
    recentDecisions,
    municipality,
  } = loaderData;
  const shortName = (municipality as Municipality)?.short_name || "View Royal";

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Hero Section with Ask Interface */}
      <div className="bg-gradient-to-b from-blue-600 to-blue-700 text-white">
        <div className="container mx-auto px-4 py-16 max-w-5xl">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
              What's happening in {shortName}?
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
              placeholder={`Ask anything about ${shortName} council decisions...`}
              className="bg-white text-zinc-900 shadow-2xl border-0"
            />
          </div>
        </div>
      </div>

      <div className="container mx-auto py-12 px-4 max-w-6xl">
        {/* Upcoming Meeting */}
        {upcomingMeeting && (
          <section className="mb-12">
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Upcoming Meeting
            </h2>
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-1">
                <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-0 text-[10px]">
                  {upcomingMeeting.type || "Council Meeting"}
                </Badge>
              </div>
              <h3 className="text-lg font-bold text-zinc-900 mb-1">
                {upcomingMeeting.title}
              </h3>
              <p className="text-sm text-zinc-500">
                {formatDate(upcomingMeeting.meeting_date)}
              </p>
              {upcomingMeeting.agendaPreview?.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {upcomingMeeting.agendaPreview.map(
                    (title: string, i: number) => (
                      <li
                        key={i}
                        className="text-sm text-zinc-600 line-clamp-1"
                      >
                        {title}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* Recent Meeting */}
        {recentMeeting && (
          <section className="mb-12">
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
              <PlayCircle className="h-4 w-4" />
              Recent Meeting
            </h2>
            <Link
              to={`/meetings/${recentMeeting.id}`}
              className="block bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden p-6 hover:border-blue-200 hover:shadow-md transition-all group"
            >
              <div className="flex items-center gap-2 mb-1">
                <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-0 text-[10px]">
                  {recentMeeting.type || "Council Meeting"}
                </Badge>
              </div>
              <h3 className="text-lg font-bold text-zinc-900 mb-1">
                {recentMeeting.title}
              </h3>
              <div className="flex items-center gap-3 text-sm text-zinc-500 mb-4">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDate(recentMeeting.meeting_date)}
                </div>
                {recentMeetingStats?.duration && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {Math.floor(recentMeetingStats.duration / 60)}h{" "}
                    {recentMeetingStats.duration % 60}m
                  </div>
                )}
              </div>

              {recentMeeting.summary && (
                <p className="text-sm text-zinc-600 leading-relaxed mb-4">
                  {recentMeeting.summary}
                </p>
              )}

              {recentMeetingDecisions.length > 0 && (
                <div className="mb-4 p-4 bg-zinc-50 rounded-xl">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
                    Key Decisions
                  </h4>
                  <ul className="space-y-2">
                    {recentMeetingDecisions.map((decision: any) => (
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

              {(recentMeetingStats?.agendaItems > 0 ||
                recentMeetingStats?.totalMotions > 0) && (
                <div className="flex gap-6 mb-4 pb-4 border-b border-zinc-100">
                  {recentMeetingStats.agendaItems > 0 && (
                    <div>
                      <div className="text-2xl font-bold text-zinc-900">
                        {recentMeetingStats.agendaItems}
                      </div>
                      <div className="text-xs text-zinc-500">Agenda Items</div>
                    </div>
                  )}
                  {recentMeetingStats.totalMotions > 0 && (
                    <div>
                      <div className="text-2xl font-bold text-zinc-900">
                        {recentMeetingStats.motionsPassed}
                        <span className="text-sm font-normal text-zinc-400">
                          /{recentMeetingStats.totalMotions}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500">
                        Motions Passed
                      </div>
                    </div>
                  )}
                  {recentMeetingStats.dividedVotes > 0 && (
                    <div>
                      <div className="text-2xl font-bold text-zinc-900">
                        {recentMeetingStats.dividedVotes}
                      </div>
                      <div className="text-xs text-zinc-500">
                        Divided Votes
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="inline-flex items-center gap-2 text-blue-600 font-semibold group-hover:text-blue-700 transition-colors">
                View Full Meeting Details
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          </section>
        )}

        {/* Active Matters */}
        {activeMatters.length > 0 && (
          <section className="mb-12">
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center justify-between">
              <span>Active Matters</span>
              <Link
                to="/matters"
                className="text-[10px] text-blue-600 hover:underline font-semibold"
              >
                View All
              </Link>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeMatters.map((matter: any) => (
                <Link
                  key={matter.id}
                  to={`/matters/${matter.id}`}
                  className="block bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 hover:border-blue-200 hover:shadow-md transition-all"
                >
                  <Badge
                    variant="secondary"
                    className="text-[10px] mb-2"
                  >
                    {matter.category || "General"}
                  </Badge>
                  <h3 className="text-sm font-bold text-zinc-900 line-clamp-2 mb-1">
                    {matter.title}
                  </h3>
                  {matter.summary && (
                    <p className="text-xs text-zinc-500 line-clamp-2">
                      {matter.summary}
                    </p>
                  )}
                  {matter.last_seen && (
                    <p className="text-[10px] text-zinc-400 mt-2">
                      Last discussed {formatDate(matter.last_seen)}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Recent Decisions */}
        {recentDecisions.length > 0 && (
          <section className="mb-12">
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center justify-between">
              <span>Recent Decisions</span>
              <Link
                to="/meetings"
                className="text-[10px] text-blue-600 hover:underline font-semibold"
              >
                View All
              </Link>
            </h2>
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden divide-y divide-zinc-100">
              {recentDecisions.map((decision: any) => (
                <Link
                  key={decision.id}
                  to={`/meetings/${decision.meetingId}`}
                  className="flex items-start gap-3 p-4 hover:bg-zinc-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-700 line-clamp-2">
                      {decision.summary}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge
                        variant={
                          decision.result === "CARRIED"
                            ? "default"
                            : "destructive"
                        }
                        className="text-[10px]"
                      >
                        {decision.result}
                      </Badge>
                      {decision.isDivided && (
                        <span className="text-[10px] font-medium text-amber-600">
                          {decision.yesCount}-{decision.noCount}
                        </span>
                      )}
                      {decision.financialCost > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                          ${decision.financialCost.toLocaleString()}
                        </Badge>
                      )}
                      {decision.meetingDate && (
                        <span className="text-[10px] text-zinc-400">
                          {formatDate(decision.meetingDate)}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
