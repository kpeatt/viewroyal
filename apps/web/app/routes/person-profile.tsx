import { useMemo, useState, useEffect } from "react";
import type { Route } from "./+types/person-profile";
import { getPersonProfile } from "../services/people";
import { getSupabaseAdminClient } from "../lib/supabase.server";
import type { Person, Membership, Attendance, Vote } from "../lib/types";
import { Link } from "react-router";

export const meta: Route.MetaFunction = ({ data }) => {
  if (!data?.person) return [{ title: "Person | ViewRoyal.ai" }];
  const p = data.person as Person;
  const activeMembership = (p as any).memberships?.find(
    (m: any) => !m.end_date || m.end_date >= new Date().toISOString().slice(0, 10),
  );
  const role = activeMembership?.role || "Council Member";
  const title = `${p.name} — ${role} | ViewRoyal.ai`;
  const description = p.bio || `${role} for the Town of View Royal.`;
  const tags: Record<string, string>[] = [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: `${p.name} — ${role}` },
    { property: "og:description", content: description },
    { property: "og:type", content: "profile" },
    { name: "twitter:card", content: "summary_large_image" },
    { property: "og:image", content: p.image_url || "https://viewroyal.ai/og-image.png" },
  ];
  return tags;
};
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Activity,
  User,
  Briefcase,
  History,
  Vote as VoteIcon,
  Gavel,
  ArrowRight,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Scale,
  Users,
} from "lucide-react";
import { Separator } from "../components/ui/separator";
import { Badge } from "../components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import { cn, formatDate } from "../lib/utils";
import { AskQuestion } from "../components/ask-question";
import { SubscribeButton } from "../components/subscribe-button";

export async function loader({ params, request }: Route.LoaderArgs) {
  const { id } = params;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "0", 10);

  try {
    const supabase = getSupabaseAdminClient();
    const data = await getPersonProfile(supabase, id, page);
    return { ...data, page };
  } catch (error: any) {
    if (error.message === "Person Not Found") {
      throw new Response("Person Not Found", { status: 404 });
    }
    throw new Response("Error loading person profile", { status: 500 });
  }
}

export default function PersonProfile({ loaderData }: Route.ComponentProps) {
  const {
    person,
    attendance,
    attendanceAll,
    attendanceTotal,
    allMeetings,
    candidacies,
    segments,
    stats,
    alignmentResults,
    page,
  } = loaderData;

  const [selectedAlignId, setSelectedAlignId] = useState<number | null>(null);

  useEffect(() => {
    if (alignmentResults && alignmentResults.length > 0 && !selectedAlignId) {
      setSelectedAlignId(alignmentResults[0].personId);
    }
  }, [alignmentResults]);

  const selectedAlignment = useMemo(() => {
    return alignmentResults?.find((r: any) => r.personId === selectedAlignId);
  }, [alignmentResults, selectedAlignId]);

  const topTopics = useMemo(() => {
    // ... same logic ...

    const counts: Record<string, number> = {};

    let total = 0;

    segments.forEach((seg) => {
      const cat = seg.agenda_items?.category;

      if (cat && cat !== "Other") {
        counts[cat] = (counts[cat] || 0) + 1;

        total++;
      }
    });

    if (total === 0) return [];

    return Object.entries(counts)

      .sort(([, a], [, b]) => b - a)

      .slice(0, 5)

      .map(([name, count]) => ({
        name,

        percent: Math.round((count / total) * 100),
      }));
  }, [segments]);

  // ... activeMemberships, pastMemberships ...

  const activeMemberships = useMemo(() => {
    const now = new Date().toISOString().split("T")[0];

    return (
      person.memberships?.filter((m) => {
        if (!m.end_date) return true;

        return m.end_date >= now;
      }) || []
    );
  }, [person.memberships]);

  const pastMemberships = useMemo(() => {
    const now = new Date().toISOString().split("T")[0];

    return (
      person.memberships?.filter((m) => {
        if (!m.end_date) return false;

        return m.end_date < now;
      }) || []
    );
  }, [person.memberships]);

  const { attendanceStats } = useMemo(() => {
    const now = new Date().toISOString().split("T")[0];

    // 1. Identify all meetings the person WAS EXPECTED to attend (up to today)

    const expectedMeetings = allMeetings.filter((meeting) => {
      // Exclude future meetings

      if (meeting.meeting_date > now) return false;

      return person.memberships?.some((m) => {
        if (m.organization_id !== meeting.organization_id) return false;

        if (m.start_date && meeting.meeting_date < m.start_date) return false;

        if (m.end_date && meeting.meeting_date > m.end_date) return false;

        return true;
      });
    });

    const totalExpected = expectedMeetings.length;

    if (totalExpected === 0) return { attendanceStats: { rate: 0, total: 0 } };

    // 2. Count how many of those expected meetings they actually attended

    // Use attendanceAll for accurate stats

    const attendedRecords = attendanceAll.filter((record) => {
      return (
        expectedMeetings.some((m) => m.id === record.meeting_id) &&
        record.attendance_mode !== "Absent" &&
        record.attendance_mode !== "Regrets"
      );
    });

    return {
      attendanceStats: {
        rate: Math.round((attendedRecords.length / totalExpected) * 100),

        total: totalExpected,
      },
    };
  }, [attendanceAll, allMeetings, person.memberships]);

  // Paginated list doesn't need complex merging/sorting logic as DB handles it

  const relevantAttendance = attendance;

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* ... header ... */}

      <div className="h-32 bg-blue-600 w-full" />

      <div className="container mx-auto px-4 max-w-6xl -mt-16">
        <Link
          to="/people"
          className="inline-flex items-center text-sm font-bold text-white hover:text-blue-100 mb-6 transition-colors drop-shadow-sm"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to Council Members
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pb-16">
          {/* Sidebar / Bio */}

          <div className="lg:col-span-4 space-y-6">
            <Card className="overflow-hidden border-none shadow-xl ring-1 ring-zinc-200/50 bg-white">
              {/* ... same avatar/header/bio ... */}

              <div className="aspect-square bg-zinc-100 flex items-center justify-center relative overflow-hidden group">
                {person.image_url ? (
                  <img
                    src={person.image_url}
                    alt={person.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <User className="h-24 w-24 text-zinc-300" />
                )}
              </div>

              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-3xl font-black tracking-tight text-zinc-900">
                    {person.name}
                  </CardTitle>
                  {person.is_councillor && (
                    <SubscribeButton type="person" targetId={person.id} label="Follow" />
                  )}
                </div>

                <div className="flex flex-col gap-1 mt-1">
                  {activeMemberships.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 text-zinc-600 font-bold text-sm"
                    >
                      <Badge className="bg-blue-600 text-white shadow-sm border-none text-[10px] h-5 px-2">
                        {m.role}
                      </Badge>

                      {m.start_date && (
                        <span className="text-[10px] text-zinc-400 uppercase tracking-widest">
                          Since {new Date(m.start_date).getFullYear()}
                        </span>
                      )}
                    </div>
                  ))}

                  {activeMemberships.length === 0 && (
                    <CardDescription className="text-zinc-500 font-medium">
                      Former View Royal Council Member
                    </CardDescription>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {person.bio && (
                  <p className="text-sm text-zinc-600 leading-relaxed italic border-l-2 border-zinc-100 pl-4">
                    "{person.bio}"
                  </p>
                )}

                {person.email && (
                  <div className="flex items-center gap-2 text-sm pt-2">
                    <span className="font-black text-zinc-400 uppercase text-[10px] tracking-widest">
                      Email
                    </span>

                    <a
                      href={`mailto:${person.email}`}
                      className="text-blue-600 font-bold hover:underline"
                    >
                      {person.email}
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-none shadow-md ring-1 ring-zinc-200/50 bg-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
                  Attendance Strength
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="flex justify-between items-end">
                  <span className="text-4xl font-black text-zinc-900">
                    {attendanceStats.rate}%
                  </span>

                  <span className="text-xs font-bold text-zinc-500 mb-1">
                    {attendanceStats.total} Meetings
                  </span>
                </div>

                <div className="w-full bg-zinc-100 rounded-full h-3 overflow-hidden shadow-inner">
                  <div
                    className={cn(
                      "h-full transition-all duration-1000",

                      attendanceStats.rate > 90
                        ? "bg-green-500"
                        : attendanceStats.rate > 80
                          ? "bg-blue-500"
                          : "bg-amber-500",
                    )}
                    style={{ width: `${attendanceStats.rate}%` }}
                  />
                </div>

                <p className="text-xs text-zinc-400 font-medium leading-relaxed">
                  Based on sessions between his election/appointment and today.
                </p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md ring-1 ring-zinc-200/50 bg-white transition-all overflow-hidden">
              <CardHeader className="pb-3 border-b border-zinc-100">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                    <Scale className="h-3 w-3 text-indigo-600" />
                    Voting Alignment
                  </CardTitle>

                  <Link
                    to={`/people/${person.id}/alignment`}
                    className="text-[10px] font-bold text-indigo-600 hover:underline flex items-center gap-0.5"
                  >
                    Full Analysis <ChevronRight className="h-2 w-2" />
                  </Link>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {alignmentResults && alignmentResults.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-zinc-50 border-b border-zinc-100">
                        <tr>
                          <th className="px-4 py-2 text-[9px] font-black text-zinc-400 uppercase tracking-widest">
                            Member
                          </th>

                          <th className="px-4 py-2 text-[9px] font-black text-zinc-400 uppercase tracking-widest text-center">
                            Shared
                          </th>

                          <th className="px-4 py-2 text-[9px] font-black text-zinc-400 uppercase tracking-widest text-right">
                            Match
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-zinc-50">
                        {alignmentResults.map((result: any) => (
                          <tr
                            key={result.personId}
                            className="hover:bg-zinc-50 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded-full bg-zinc-100 border border-zinc-200 overflow-hidden shrink-0">
                                  {result.imageUrl ? (
                                    <img
                                      src={result.imageUrl}
                                      alt={result.personName}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <User className="h-3 w-3 m-1.5 text-zinc-300" />
                                  )}
                                </div>

                                <span className="text-xs font-bold text-zinc-700 truncate max-w-[100px]">
                                  {result.personName.split(" ").pop()}
                                </span>
                              </div>
                            </td>

                            <td className="px-4 py-3 text-center text-[10px] font-bold text-zinc-500 tabular-nums">
                              {result.totalMotions}
                            </td>

                            <td className="px-4 py-3 text-right">
                              <span
                                className={cn(
                                  "text-xs font-black tabular-nums",

                                  result.alignmentRate > 90
                                    ? "text-green-600"
                                    : result.alignmentRate > 75
                                      ? "text-indigo-600"
                                      : "text-amber-600",
                                )}
                              >
                                {result.alignmentRate.toFixed(0)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="h-8 w-8 text-zinc-200 mx-auto mb-2" />

                    <p className="text-xs text-zinc-400 italic font-medium px-6">
                      No shared voting records found for overlapping tenures.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {topTopics.length > 0 && (
              <Card className="border-none shadow-md ring-1 ring-zinc-200/50 bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400 flex items-center gap-2">
                    Focus Areas
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  {topTopics.map((topic) => (
                    <div key={topic.name} className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className="text-zinc-500">{topic.name}</span>

                        <span className="text-zinc-900">{topic.percent}%</span>
                      </div>

                      <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-blue-600 h-full rounded-full opacity-80"
                          style={{ width: `${topic.percent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <AskQuestion
              personId={person.id}
              personName={person.name}
              className="shadow-xl"
            />
          </div>

          {/* Main Content */}

          <div className="lg:col-span-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* Voting Stats Card - KEEP EXISTING */}

              <Link to={`/people/${person.id}/votes`} className="group">
                <Card className="h-full border-none shadow-sm ring-1 ring-zinc-200 hover:ring-blue-500 transition-all">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                      <VoteIcon className="h-4 w-4 text-blue-600" />
                      Voting Record
                    </CardTitle>
                  </CardHeader>

                  <CardContent>
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-3xl font-black text-zinc-900">
                        {stats.totalVotes.toLocaleString()}
                      </div>

                      <div className="p-2 bg-blue-50 rounded-full group-hover:bg-blue-600 transition-colors">
                        <ArrowRight className="h-5 w-5 text-blue-600 group-hover:text-white" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      {stats.votesBreakdown && (
                        <>
                          <div className="flex items-center gap-2 text-xs">
                            <ThumbsUp className="h-3 w-3 text-green-600" />

                            <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500"
                                style={{
                                  width: `${(stats.votesBreakdown.yes / stats.totalVotes) * 100}%`,
                                }}
                              />
                            </div>

                            <span className="font-bold text-zinc-700 w-8 text-right">
                              {stats.votesBreakdown.yes}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-xs">
                            <ThumbsDown className="h-3 w-3 text-red-600" />

                            <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-red-500"
                                style={{
                                  width: `${(stats.votesBreakdown.no / stats.totalVotes) * 100}%`,
                                }}
                              />
                            </div>

                            <span className="font-bold text-zinc-700 w-8 text-right">
                              {stats.votesBreakdown.no}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-xs">
                            <Minus className="h-3 w-3 text-zinc-400" />

                            <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-zinc-400"
                                style={{
                                  width: `${(stats.votesBreakdown.abstain / stats.totalVotes) * 100}%`,
                                }}
                              />
                            </div>

                            <span className="font-bold text-zinc-700 w-8 text-right">
                              {stats.votesBreakdown.abstain}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>

              {/* Proposal Stats Card - KEEP EXISTING */}

              <Link to={`/people/${person.id}/proposals`} className="group">
                <Card className="h-full border-none shadow-sm ring-1 ring-zinc-200 hover:ring-indigo-500 transition-all">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                      <Gavel className="h-4 w-4 text-indigo-600" />
                      Legislative Proposals
                    </CardTitle>
                  </CardHeader>

                  <CardContent>
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-3xl font-black text-zinc-900">
                        {(
                          stats.totalMoved + stats.totalSeconded
                        ).toLocaleString()}
                      </div>

                      <div className="p-2 bg-indigo-50 rounded-full group-hover:bg-indigo-600 transition-colors">
                        <ArrowRight className="h-5 w-5 text-indigo-600 group-hover:text-white" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-100">
                        <div className="text-[10px] font-black uppercase text-zinc-400 mb-1">
                          Moved
                        </div>

                        <div className="text-xl font-bold text-zinc-900">
                          {stats.totalMoved}
                        </div>
                      </div>

                      <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-100">
                        <div className="text-[10px] font-black uppercase text-zinc-400 mb-1">
                          Seconded
                        </div>

                        <div className="text-xl font-bold text-zinc-900">
                          {stats.totalSeconded}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>

            <Tabs defaultValue="activity" className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between bg-white p-2 rounded-xl border border-zinc-200 shadow-sm sticky top-20 z-10 gap-2 overflow-x-auto">
                <TabsList className="bg-transparent border-none">
                  <TabsTrigger
                    value="activity"
                    className="font-bold data-[state=active]:bg-zinc-900 data-[state=active]:text-white rounded-lg px-4"
                  >
                    <History className="h-4 w-4 mr-2" />
                    Attendance History
                  </TabsTrigger>

                  <TabsTrigger
                    value="memberships"
                    className="font-bold data-[state=active]:bg-zinc-900 data-[state=active]:text-white rounded-lg px-4"
                  >
                    <Briefcase className="h-4 w-4 mr-2" />
                    Roles & Organizations
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="activity" className="space-y-4">
                <div className="bg-white rounded-2xl border border-zinc-200 shadow-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-zinc-50 border-b border-zinc-200 sticky top-0 z-10">
                        <tr>
                          <th className="px-6 py-4 font-black uppercase text-[10px] tracking-widest text-zinc-400">
                            Meeting Date
                          </th>

                          <th className="px-6 py-4 font-black uppercase text-[10px] tracking-widest text-zinc-400">
                            Title
                          </th>

                          <th className="px-6 py-4 font-black uppercase text-[10px] tracking-widest text-zinc-400 w-32">
                            Status
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-zinc-100">
                        {relevantAttendance.map((record) => (
                          <tr
                            key={record.id}
                            className="hover:bg-zinc-50 transition-colors group"
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-zinc-500 font-medium">
                              {formatDate(record.meetings?.meeting_date)}
                            </td>

                            <td className="px-6 py-4">
                              <Link
                                to={`/meetings/${record.meeting_id}`}
                                className="font-bold text-zinc-900 group-hover:text-blue-600 transition-colors block"
                              >
                                {record.meetings?.title}
                              </Link>
                            </td>

                            <td className="px-6 py-4 text-right">
                              <Badge
                                variant="outline"
                                className={`text-[9px] font-black uppercase px-2 py-0.5 ${
                                  record.attendance_mode === "No Record"
                                    ? "border-amber-200 text-amber-700 bg-amber-50"
                                    : record.attendance_mode === "Absent" ||
                                        record.attendance_mode === "Regrets"
                                      ? "border-red-200 text-red-700 bg-red-50"
                                      : "border-green-200 text-green-700 bg-green-50"
                                }`}
                              >
                                {record.attendance_mode}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {attendanceTotal > 20 && (
                    <div className="p-4 border-t border-zinc-200 flex justify-between items-center bg-zinc-50">
                      <div className="text-xs text-zinc-500 font-bold">
                        Showing {page * 20 + 1}-
                        {Math.min((page + 1) * 20, attendanceTotal)} of{" "}
                        {attendanceTotal}
                      </div>

                      <div className="flex gap-2">
                        <Link
                          to={`?page=${Math.max(0, page - 1)}`}
                          preventScrollReset={true}
                          className={cn(
                            "px-3 py-1.5 rounded-lg border border-zinc-300 text-xs font-bold bg-white hover:bg-zinc-100 transition-colors",

                            page === 0 && "pointer-events-none opacity-50",
                          )}
                        >
                          Previous
                        </Link>

                        <Link
                          to={`?page=${page + 1}`}
                          preventScrollReset={true}
                          className={cn(
                            "px-3 py-1.5 rounded-lg border border-zinc-300 text-xs font-bold bg-white hover:bg-zinc-100 transition-colors",

                            (page + 1) * 20 >= attendanceTotal &&
                              "pointer-events-none opacity-50",
                          )}
                        >
                          Next
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="memberships" className="space-y-6">
                <div className="space-y-8">
                  {activeMemberships.length > 0 && (
                    <section>
                      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400 mb-4 px-1">
                        Current Roles
                      </h3>

                      <div className="grid gap-4">
                        {activeMemberships.map((m) => (
                          <div
                            key={m.id}
                            className="p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm flex justify-between items-center group hover:border-blue-400 transition-all"
                          >
                            <div>
                              <div className="font-black text-zinc-900 text-lg">
                                {m.role}
                              </div>

                              <div className="text-sm text-zinc-500 font-medium">
                                {m.organization?.name}
                              </div>
                            </div>

                            <div className="text-[10px] font-black text-blue-600 uppercase bg-blue-50 px-3 py-1 rounded-full border border-blue-100 shadow-sm">
                              Since {new Date(m.start_date || "").getFullYear()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {pastMemberships.length > 0 && (
                    <section>
                      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400 mb-4 px-1">
                        Historical Roles
                      </h3>

                      <div className="grid gap-4 opacity-70">
                        {pastMemberships.map((m) => (
                          <div
                            key={m.id}
                            className="p-6 bg-zinc-50/50 rounded-2xl border border-dashed border-zinc-200 flex justify-between items-center group grayscale hover:grayscale-0 transition-all"
                          >
                            <div>
                              <div className="font-bold text-zinc-700">
                                {m.role}
                              </div>

                              <div className="text-sm text-zinc-400 font-medium">
                                {m.organization?.name}
                              </div>
                            </div>

                            <div className="text-[10px] font-black text-zinc-400 uppercase bg-white px-3 py-1 rounded-full border border-zinc-200 tabular-nums">
                              {new Date(m.start_date || "").getFullYear()} -{" "}
                              {new Date(m.end_date || "").getFullYear()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              </TabsContent>

              {candidacies.length > 0 && (
                <section className="mt-8">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400 mb-4 px-1">
                    Electoral History
                  </h3>

                  <div className="grid gap-4">
                    {candidacies.map((can: any) => (
                      <div
                        key={can.id}
                        className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm hover:border-blue-400 transition-all"
                      >
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <h3 className="text-xl font-black text-zinc-900">
                              {can.election_offices?.elections?.name}
                            </h3>

                            <div className="text-sm text-zinc-500 font-medium">
                              Candidate for {can.election_offices?.office}
                            </div>
                          </div>

                          <Badge
                            className={cn(
                              "font-black text-[10px] uppercase px-3",

                              can.is_elected
                                ? "bg-green-600 shadow-lg shadow-green-200"
                                : "bg-zinc-400",
                            )}
                          >
                            {can.is_elected ? "Elected" : "Not Elected"}
                          </Badge>
                        </div>

                        <div className="flex gap-12">
                          <div>
                            <div className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-1">
                              Votes Received
                            </div>

                            <div className="text-3xl font-black text-zinc-900 tabular-nums">
                              {can.votes_received?.toLocaleString() || "N/A"}
                            </div>
                          </div>

                          {can.election_offices?.elections?.election_date && (
                            <div>
                              <div className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-1">
                                Election Date
                              </div>

                              <div className="text-3xl font-black text-zinc-900">
                                {new Date(
                                  can.election_offices.elections.election_date,
                                ).getFullYear()}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
