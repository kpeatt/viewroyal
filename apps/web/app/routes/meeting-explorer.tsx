import type { Route } from "./+types/meeting-explorer";
import { getMeetingById } from "../services/meetings";
import { getSupabaseAdminClient } from "../lib/supabase.server";
import { Link, useSearchParams } from "react-router";
import { useState, useMemo, useRef } from "react";
import {
  ChevronLeft,
  Activity,
  ExternalLink,
  PlayCircle,
  FileText,
  Clock,
  Sparkles,
  ClipboardList,
  Gavel,
  Users,
  Search,
  MessageSquare,
} from "lucide-react";
import { Separator } from "../components/ui/separator";
import { Badge } from "../components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";
import { cn, formatDate } from "../lib/utils";
import { AgendaCard } from "../components/agenda-card";
import { MotionsList } from "../components/motions-list";
import { PeopleGrid } from "../components/people-grid";
import { FormattedText } from "../components/formatted-text";
import { MeetingTimeline } from "../components/meeting-timeline";
import {
  MeetingPlayer,
  type MeetingPlayerHandle,
} from "../components/meeting-player";
import { getSpeakerColorIndex, SPEAKER_TEXT_COLORS } from "../lib/colors";
import type { Person, Membership, Attendance } from "../lib/types";

export async function loader({ params }: Route.LoaderArgs) {
  // ... existing loader ...
  const { id } = params;
  try {
    const supabase = getSupabaseAdminClient();
    const data = await getMeetingById(supabase, id);
    return data;
  } catch (error: any) {
    if (error.message === "Meeting Not Found") {
      throw new Response("Meeting Not Found", { status: 404 });
    }
    throw new Response("Error loading meeting", { status: 500 });
  }
}

export default function MeetingExplorer({ loaderData }: Route.ComponentProps) {
  const {
    meeting: rawMeeting,
    agendaItems: rawAgendaItems,
    transcript: rawTranscript,
    speakerAliases: rawSpeakerAliases,
    attendance: rawAttendance,
    people,
  } = loaderData;

  // Hydrate data from normalized people map
  const meeting = useMemo(
    () => ({
      ...rawMeeting,
      chair: rawMeeting.chair_person_id
        ? people[rawMeeting.chair_person_id]
        : rawMeeting.chair,
    }),
    [rawMeeting, people],
  );

  const agendaItems = useMemo(
    () =>
      rawAgendaItems.map((item: any) => ({
        ...item,
        motions: (item.motions || []).map((motion: any) => ({
          ...motion,
          mover_person: motion.mover_id ? people[motion.mover_id] : undefined,
          seconder_person: motion.seconder_id
            ? people[motion.seconder_id]
            : undefined,
          votes: (motion.votes || []).map((vote: any) => ({
            ...vote,
            person: vote.person_id ? people[vote.person_id] : undefined,
          })),
        })),
      })),
    [rawAgendaItems, people],
  );

  const transcript = useMemo(
    () =>
      rawTranscript.map((s: any) => ({
        ...s,
        person: s.person_id ? people[s.person_id] : undefined,
      })),
    [rawTranscript, people],
  );

  const attendance = useMemo(
    () =>
      rawAttendance.map((a: any) => ({
        ...a,
        person: a.person_id ? people[a.person_id] : undefined,
      })),
    [rawAttendance, people],
  );

  // State
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>(
    {},
  );
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [activeSegmentId, setActiveSegmentId] = useState<number | null>(null);
  const transcriptRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") || "agenda";
  const playerRef = useRef<MeetingPlayerHandle>(null);

  const handleTabChange = (value: string) => {
    setSearchParams(
      (prev) => {
        prev.set("tab", value);
        return prev;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  const handleSegmentHover = (id: number | null) => {
    setActiveSegmentId(id);
    if (id && transcriptRefs.current[id]) {
      const element = transcriptRefs.current[id];
      const container = element?.closest(".overflow-y-auto");
      if (element && container) {
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const relativeTop =
          elementRect.top - containerRect.top + container.scrollTop;

        container.scrollTo({
          top: relativeTop - containerRect.height / 2 + elementRect.height / 2,
          behavior: "smooth",
        });
      }
    }
  };

  // Speaker helpers
  const speakerMap = useMemo(() => {
    const map: Record<string, string> = {};
    rawSpeakerAliases?.forEach((alias: any) => {
      map[alias.speaker_label] =
        people[alias.person_id]?.name || alias.speaker_label;
    });
    return map;
  }, [rawSpeakerAliases, people]);

  const resolveSpeakerName = (segment: any) => {
    if (segment.person?.name) return segment.person.name;
    const label = segment.speaker_name;
    return speakerMap[label] || label || "Unknown Speaker";
  };

  const getPersonRole = (person?: Person) => {
    if (!person) return null;
    const meetingDate = new Date(meeting.meeting_date);
    const activeMembership = person.memberships?.find((m: Membership) => {
      const start = m.start_date ? new Date(m.start_date) : new Date(0);
      const end = m.end_date ? new Date(m.end_date) : new Date(2100, 0, 1);
      return meetingDate >= start && meetingDate <= end;
    });
    if (activeMembership) return activeMembership.role;
    const fallback = person.memberships?.find(
      (m) =>
        m.organization?.classification === "Council" ||
        m.organization?.classification === "Staff",
    );
    return fallback?.role || (person.is_councillor ? "Councillor" : null);
  };

  // Stats calculation
  const speakerStats = useMemo(() => {
    const stats: Record<string, number> = {};
    let totalTime = 0;
    transcript.forEach((segment) => {
      const name = resolveSpeakerName(segment);
      const duration = segment.end_time - segment.start_time;
      stats[name] = (stats[name] || 0) + duration;
      totalTime += duration;
    });
    return { stats, totalTime };
  }, [transcript, speakerMap]);

  const stats = useMemo(() => {
    const motionCount = agendaItems.reduce(
      (acc, item) => acc + (item.motions?.length || 0),
      0,
    );
    const durationMins = meeting.video_duration_seconds
      ? Math.floor(meeting.video_duration_seconds / 60)
      : 0;
    const durationHours = Math.floor(durationMins / 60);
    const durationStr =
      durationHours > 0
        ? `${durationHours}h ${durationMins % 60}m`
        : `${durationMins}m`;

    return {
      items: agendaItems.length,
      motions: motionCount,
      people: Object.keys(speakerStats.stats).length,
      duration: durationStr,
    };
  }, [agendaItems, meeting, speakerStats]);

  // Grouping for PeopleGrid
  const attendanceGroups = useMemo(() => {
    const groups = {
      council: [] as any[],
      staff: [] as any[],
      others: [] as any[],
    };
    const seenPersonIds = new Set<number>();
    const seenNames = new Set<string>();

    attendance.forEach((record) => {
      if (record.person_id) seenPersonIds.add(record.person_id);
      const name = record.person?.name || "Unknown";
      seenNames.add(name);
      const person = record.person;
      const role = getPersonRole(person);
      const roleLower = role?.toLowerCase() || "";
      const ext = { ...record, resolvedName: name };

      if (
        person?.is_councillor ||
        roleLower.includes("mayor") ||
        roleLower.includes("councillor")
      ) {
        groups.council.push(ext);
      } else if (
        roleLower.includes("director") ||
        roleLower.includes("clerk") ||
        roleLower.includes("cao")
      ) {
        groups.staff.push(ext);
      } else {
        groups.others.push(ext);
      }
    });

    transcript.forEach((segment) => {
      const name = resolveSpeakerName(segment);
      const personId = segment.person_id;
      if (personId && !seenPersonIds.has(personId)) {
        seenPersonIds.add(personId);
        seenNames.add(name);
        const virtual = {
          id: `v-${personId}`,
          person_id: personId,
          person: segment.person,
          isVirtual: true,
          resolvedName: name,
        };
        const roleLower = getPersonRole(segment.person)?.toLowerCase() || "";
        if (
          segment.person?.is_councillor ||
          roleLower.includes("mayor") ||
          roleLower.includes("councillor")
        ) {
          groups.council.push(virtual);
        } else if (
          roleLower.includes("director") ||
          roleLower.includes("clerk") ||
          roleLower.includes("cao")
        ) {
          groups.staff.push(virtual);
        } else {
          groups.others.push(virtual);
        }
      } else if (
        !personId &&
        !seenNames.has(name) &&
        name !== "Unknown Speaker"
      ) {
        seenNames.add(name);
        groups.others.push({
          id: `v-${name}`,
          person_id: null,
          isVirtual: true,
          resolvedName: name,
        });
      }
    });
    return groups;
  }, [attendance, transcript, speakerMap, meeting.meeting_date]);

  const filteredTranscript = useMemo(() => {
    if (!transcriptSearch) return transcript;
    const query = transcriptSearch.toLowerCase();
    return transcript.filter(
      (s) =>
        s.text_content.toLowerCase().includes(query) ||
        resolveSpeakerName(s).toLowerCase().includes(query),
    );
  }, [transcript, transcriptSearch]);

  const getVimeoTimeUrl = (seconds: number) => {
    if (!meeting.video_url) return "#";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const timeStr = `${h > 0 ? h + "h" : ""}${m}m${s}s`;
    return `${meeting.video_url.split("#")[0]}#t=${timeStr}`;
  };

  const toggleItem = (id: number) => {
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const openInVimeo = (startTime: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(startTime);
    } else {
      window.open(getVimeoTimeUrl(startTime), "_blank");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50">
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        <Link
          to="/meetings"
          className="group flex items-center text-sm font-bold text-zinc-500 hover:text-blue-600 mb-6 transition-colors w-fit"
        >
          <ChevronLeft className="mr-1 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          Back to Meetings
        </Link>

        <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-black tracking-tight">
              {meeting.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-zinc-500 font-bold text-sm">
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {formatDate(meeting.meeting_date, {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </div>
              <Separator
                orientation="vertical"
                className="h-4 hidden md:block"
              />
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {meeting.organization?.name || "Town Council"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {meeting.agenda_url && (
              <a
                href={meeting.agenda_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-xs py-2 px-4 rounded-full transition-all shadow-sm"
              >
                <FileText className="h-3.5 w-3.5 text-zinc-400" />
                Agenda PDF
              </a>
            )}
            {meeting.minutes_url && (
              <a
                href={meeting.minutes_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-xs py-2 px-4 rounded-full transition-all shadow-sm"
              >
                <FileText className="h-3.5 w-3.5 text-zinc-400" />
                Minutes PDF
              </a>
            )}
            {meeting.video_url && (
              <a
                href={meeting.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold text-xs py-2 px-4 rounded-full transition-all shadow-sm hover:scale-105"
              >
                Vimeo Page
                <ExternalLink className="h-3.5 w-3.5 opacity-50" />
              </a>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Player & Stats */}
          <div className="lg:col-span-5 space-y-8 lg:sticky lg:top-8">
            {meeting.video_url ? (
              <MeetingPlayer
                ref={playerRef}
                videoUrl={meeting.video_url}
                agendaItems={agendaItems}
              />
            ) : (
              <div className="aspect-video bg-zinc-200 dark:bg-zinc-800 rounded-2xl flex items-center justify-center border-4 border-dashed border-zinc-300 dark:border-zinc-700">
                <p className="text-zinc-500 font-bold">No video available</p>
              </div>
            )}

            {meeting.summary && (
              <section>
                <div
                  className={cn(
                    "bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border overflow-hidden transition-all duration-300",
                    !isSummaryExpanded && "max-h-[68px]",
                  )}
                >
                  <button
                    onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                    className="w-full flex items-center justify-between p-5 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-lg">
                        <Sparkles className="h-5 w-5 text-amber-600" />
                      </div>
                      <h2 className="text-lg font-bold">Summary</h2>
                    </div>
                    <Badge variant="secondary" className="font-bold">
                      {isSummaryExpanded ? "Hide" : "Show"}
                    </Badge>
                  </button>
                  <div className="px-5 pb-6 pt-0">
                    <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed italic text-sm">
                      "{meeting.summary}"
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* Quick Stats Bar */}
            <section className="grid grid-cols-2 gap-4">
              {[
                {
                  label: "Agenda",
                  value: stats.items,
                  icon: ClipboardList,
                  color: "text-blue-600 bg-blue-50 dark:bg-blue-900/20",
                },
                {
                  label: "Motions",
                  value: stats.motions,
                  icon: Gavel,
                  color: "text-amber-600 bg-amber-50 dark:bg-amber-900/20",
                },
                {
                  label: "People",
                  value: stats.people,
                  icon: Users,
                  color:
                    "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20",
                },
                {
                  label: "Length",
                  value: stats.duration,
                  icon: Clock,
                  color: "text-purple-600 bg-purple-50 dark:bg-purple-900/20",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-white dark:bg-zinc-900 p-4 rounded-xl border flex items-center gap-4 shadow-sm"
                >
                  <div className={cn("p-2 rounded-lg", stat.color)}>
                    <stat.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xl font-black">{stat.value}</div>
                    <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
                      {stat.label}
                    </div>
                  </div>
                </div>
              ))}
            </section>
          </div>

          {/* Right Column: Tabs */}
          <div className="lg:col-span-7 min-w-0">
            <Tabs
              value={currentTab}
              onValueChange={handleTabChange}
              className="w-full space-y-6"
            >
              <TabsList className="w-full grid grid-cols-4 h-auto p-1 bg-muted/50 rounded-xl">
                <TabsTrigger
                  value="agenda"
                  className="py-2.5 font-bold rounded-lg transition-all"
                >
                  Agenda
                </TabsTrigger>
                <TabsTrigger
                  value="motions"
                  className="py-2.5 font-bold rounded-lg transition-all"
                >
                  Motions
                </TabsTrigger>
                <TabsTrigger
                  value="people"
                  className="py-2.5 font-bold rounded-lg transition-all"
                >
                  People
                </TabsTrigger>
                <TabsTrigger
                  value="transcript"
                  className="py-2.5 font-bold rounded-lg transition-all"
                >
                  Transcript
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="agenda"
                className="mt-0 focus-visible:outline-none outline-none space-y-8"
              >
                {transcript.length > 0 && (
                  <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border shadow-sm">
                    <div className="flex items-center justify-between mb-4 text-zinc-400">
                      <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                        <Activity className="h-3.5 w-3.5" />
                        Meeting Pulse
                      </h3>
                    </div>
                    <MeetingTimeline
                      transcript={transcript}
                      agendaItems={agendaItems}
                      videoUrl={meeting.video_url}
                      speakerMap={speakerMap}
                      onSegmentHover={handleSegmentHover}
                      activeSegmentId={activeSegmentId}
                    />
                  </div>
                )}

                <div className="grid gap-4">
                  {agendaItems.length > 0 ? (
                    agendaItems.map((item) => (
                      <AgendaCard
                        key={item.id}
                        item={item}
                        isExpanded={!!expandedItems[item.id]}
                        onToggle={() => toggleItem(item.id)}
                        onWatchVideo={openInVimeo}
                        resolveSpeakerName={resolveSpeakerName}
                      />
                    ))
                  ) : (
                    <div className="text-center py-20 bg-zinc-100 dark:bg-zinc-900 rounded-2xl border-2 border-dashed">
                      <p className="text-zinc-500 font-medium">
                        No agenda items available.
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent
                value="motions"
                className="mt-0 focus-visible:outline-none outline-none"
              >
                <MotionsList
                  agendaItems={agendaItems}
                  onWatchVideo={openInVimeo}
                />
              </TabsContent>

              <TabsContent
                value="people"
                className="mt-0 focus-visible:outline-none outline-none"
              >
                <PeopleGrid
                  attendanceGroups={attendanceGroups}
                  speakerStats={speakerStats}
                  getPersonRole={getPersonRole}
                  agendaItems={agendaItems}
                />
              </TabsContent>

              <TabsContent
                value="transcript"
                className="mt-0 focus-visible:outline-none outline-none"
              >
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border shadow-sm flex flex-col h-[800px] overflow-hidden">
                  <div className="p-4 border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-blue-600" />
                      Full Transcript
                    </h2>
                    <div className="relative w-full md:max-w-sm">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Search conversation..."
                        className="w-full pl-9 pr-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                        value={transcriptSearch}
                        onChange={(e) => setTranscriptSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {filteredTranscript.length > 0 ? (
                      filteredTranscript.map((segment) => {
                        const speakerName = resolveSpeakerName(segment);
                        const colorIdx = getSpeakerColorIndex(speakerName);
                        return (
                          <div
                            key={segment.id}
                            ref={(el) => {
                              transcriptRefs.current[segment.id] = el;
                            }}
                            className={cn(
                              "group p-4 rounded-xl border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-all cursor-pointer",
                              activeSegmentId === segment.id &&
                                "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800 ring-1 ring-blue-100 dark:ring-blue-900/20",
                            )}
                            onClick={() => openInVimeo(segment.start_time)}
                            onMouseEnter={() => setActiveSegmentId(segment.id)}
                            onMouseLeave={() => setActiveSegmentId(null)}
                          >
                            <div className="flex items-start justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    "text-xs font-black uppercase tracking-tighter",
                                    SPEAKER_TEXT_COLORS[colorIdx],
                                  )}
                                >
                                  {speakerName}
                                </span>
                                {segment.person && (
                                  <Badge
                                    variant="outline"
                                    className="h-4 text-[9px] px-1 font-bold"
                                  >
                                    {getPersonRole(segment.person)}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] font-mono font-bold text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                {Math.floor(segment.start_time / 60)}:
                                {(segment.start_time % 60)
                                  .toFixed(0)
                                  .padStart(2, "0")}
                                <ExternalLink className="h-3 w-3" />
                              </div>
                            </div>
                            <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-zinc-100">
                              {segment.corrected_text_content ||
                                segment.text_content}
                            </p>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center py-20 text-zinc-500 italic">
                        No transcript segments match your search.
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
