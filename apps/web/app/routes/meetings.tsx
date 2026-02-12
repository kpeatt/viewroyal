import type { Route } from "./+types/meetings";
import { getMeetings } from "../services/meetings";
import { getSupabaseAdminClient } from "../lib/supabase.server";
import type { Meeting } from "../lib/types";
import { cn } from "../lib/utils";

export const meta: Route.MetaFunction = ({ data }) => {
  const year = (data as any)?.selectedYear;
  const title = year
    ? `${year} Council Meetings | ViewRoyal.ai`
    : "Council Meetings | ViewRoyal.ai";
  return [
    { title },
    { name: "description", content: "Browse all View Royal council meetings, agendas, transcripts, and voting records." },
    { property: "og:title", content: title },
    { property: "og:description", content: "Browse all View Royal council meetings, agendas, transcripts, and voting records." },
    { name: "twitter:card", content: "summary" },
  ];
};
import {
  useSearchParams,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import { useState, useEffect, useMemo } from "react";
import {
  Search,
  Filter,
  Calendar as CalendarIcon,
  LayoutList,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from "lucide-react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";
import { MeetingCard } from "../components/meeting-card";
import { CalendarView } from "../components/calendar-view";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const currentYear = new Date().getFullYear();
  const selectedYear = parseInt(
    url.searchParams.get("year") || currentYear.toString(),
  );

  try {
    const supabase = getSupabaseAdminClient();
    const meetings = await getMeetings(supabase, {
      startDate: `${selectedYear}-01-01`,
      endDate: `${selectedYear}-12-31`,
    });
    return { meetings, selectedYear, currentYear };
  } catch (error) {
    console.error("Error loading meetings data:", error);
    return { meetings: [], selectedYear, currentYear };
  }
}

export function shouldRevalidate({
  currentUrl,
  nextUrl,
}: ShouldRevalidateFunctionArgs) {
  return (
    currentUrl.searchParams.get("year") !== nextUrl.searchParams.get("year")
  );
}

export default function Meetings({ loaderData }: Route.ComponentProps) {
  const { meetings, selectedYear, currentYear } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();

  // View state (List vs Calendar)
  const view = searchParams.get("view") || "list";

  // Filter states
  const statusTab = searchParams.get("status") || "past";
  const qParam = searchParams.get("q") || "";
  const [searchQuery, setSearchQuery] = useState(qParam);
  const orgFilter = searchParams.get("org") || "";
  const typeFilter = searchParams.get("type") || "";
  const sortOrder = searchParams.get("sort") || "desc";

  const years = useMemo(() => {
    const startYear = 2008;
    const yearsArr = [];
    for (let y = currentYear; y >= startYear; y--) {
      yearsArr.push(y);
    }
    return yearsArr;
  }, [currentYear]);

  // Extract unique organizations and types from loaded meetings
  const organizations = useMemo(() => {
    const orgs = new Set<string>();
    meetings.forEach((m) => {
      const name = m.organization?.name;
      if (name) orgs.add(name);
    });
    return Array.from(orgs).sort();
  }, [meetings]);

  const meetingTypes = useMemo(() => {
    const types = new Set<string>();
    meetings.forEach((m) => {
      if (m.type) types.add(m.type);
    });
    return Array.from(types).sort();
  }, [meetings]);

  // Filtered and sorted meetings for the LIST VIEW
  const filteredMeetingsForList = useMemo(() => {
    const filtered = meetings.filter((m) => {
      // Status Filter
      const isPast = new Date(m.meeting_date) < new Date();
      const effectiveStatus = m.status || (isPast ? "Completed" : "Planned");

      if (statusTab === "past") {
        const isActuallyPast =
          effectiveStatus === "Completed" ||
          effectiveStatus === "Occurred" ||
          effectiveStatus === "Cancelled";
        if (!isActuallyPast) return false;
      }

      if (
        statusTab === "upcoming" &&
        effectiveStatus !== "Planned" &&
        effectiveStatus !== "Scheduled" &&
        effectiveStatus.toLowerCase() !== "scheduled"
      ) {
        return false;
      }

      // Organization Filter
      if (orgFilter && m.organization?.name !== orgFilter) return false;

      // Type Filter
      if (typeFilter && m.type !== typeFilter) return false;

      // Search Filter
      if (searchQuery) {
        const lowerQuery = searchQuery.toLowerCase();
        const matchesTitle = m.title.toLowerCase().includes(lowerQuery);
        const matchesSummary = m.summary?.toLowerCase().includes(lowerQuery);
        if (!matchesTitle && !matchesSummary) return false;
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      const dateA = new Date(a.meeting_date).getTime();
      const dateB = new Date(b.meeting_date).getTime();
      return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
    });

    return filtered;
  }, [meetings, statusTab, searchQuery, orgFilter, typeFilter, sortOrder]);

  const hasActiveFilters = orgFilter || typeFilter || searchQuery;

  const updateFilters = (updates: Record<string, string | null>) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === "") {
        newParams.delete(key);
      } else {
        newParams.set(key, value);
      }
    });
    setSearchParams(newParams);
  };

  // Sync local search state with URL param
  useEffect(() => {
    setSearchQuery(qParam);
  }, [qParam]);

  // Debounce search URL updates
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== qParam) {
        updateFilters({ q: searchQuery || null });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, qParam]);

  const clearFilters = () => {
    const newParams = new URLSearchParams();
    if (selectedYear !== currentYear)
      newParams.set("year", selectedYear.toString());
    if (view !== "list") newParams.set("view", view);
    newParams.set("status", "past");
    setSearchParams(newParams);
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="container mx-auto py-12 px-4 max-w-7xl">
        <header className="mb-10">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-600 rounded-lg">
                  <CalendarIcon className="h-6 w-6 text-white" />
                </div>
                <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900">
                  Meetings
                </h1>
              </div>
            </div>

            {/* View Switcher */}
            <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-zinc-200 shadow-sm self-start lg:self-auto">
              <button
                onClick={() => updateFilters({ view: "list" })}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
                  view === "list"
                    ? "bg-zinc-900 text-white shadow-md"
                    : "text-zinc-500 hover:bg-zinc-100",
                )}
              >
                <LayoutList className="h-4 w-4" />
                List
              </button>
              <button
                onClick={() => updateFilters({ view: "calendar" })}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
                  view === "calendar"
                    ? "bg-zinc-900 text-white shadow-md"
                    : "text-zinc-500 hover:bg-zinc-100",
                )}
              >
                <CalendarIcon className="h-4 w-4" />
                Calendar
              </button>
            </div>
          </div>
        </header>

        <Tabs
          value={view}
          onValueChange={(v) => updateFilters({ view: v })}
          className="w-full"
        >
          {/* Calendar View */}
          <TabsContent value="calendar" className="mt-0">
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden mb-8">
              <CalendarView meetings={meetings} />
            </div>
          </TabsContent>

          {/* List View */}
          <TabsContent value="list" className="mt-0 space-y-6">
            {/* Row 1: Year, Search, Status */}
            <div className="flex flex-col md:flex-row gap-4">
              {/* Year Selector */}
              <div className="flex items-center gap-2 bg-white border border-zinc-200 p-1 rounded-xl shadow-sm">
                <button
                  onClick={() =>
                    updateFilters({ year: (selectedYear - 1).toString() })
                  }
                  className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-500"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <select
                  value={selectedYear}
                  onChange={(e) => updateFilters({ year: e.target.value })}
                  className="bg-transparent text-sm font-bold text-zinc-900 px-2 focus:outline-none cursor-pointer"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() =>
                    updateFilters({ year: (selectedYear + 1).toString() })
                  }
                  disabled={selectedYear >= currentYear}
                  className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-500 disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input
                  placeholder="Search meeting titles or topics..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-10 h-12 bg-white border border-zinc-200 shadow-sm rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:outline-none font-medium"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-100 rounded-full text-zinc-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Status Tabs */}
              <div className="flex items-center bg-white border border-zinc-200 p-1 rounded-xl shadow-sm min-w-[240px]">
                <button
                  onClick={() => updateFilters({ status: null })}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all",
                    statusTab === "all"
                      ? "bg-blue-50 text-blue-700"
                      : "text-zinc-400 hover:text-zinc-600",
                  )}
                >
                  All
                </button>
                <button
                  onClick={() => updateFilters({ status: "upcoming" })}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all",
                    statusTab === "upcoming"
                      ? "bg-amber-50 text-amber-700"
                      : "text-zinc-400 hover:text-zinc-600",
                  )}
                >
                  Upcoming
                </button>
                <button
                  onClick={() => updateFilters({ status: "past" })}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all",
                    statusTab === "past"
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-zinc-400 hover:text-zinc-600",
                  )}
                >
                  Past
                </button>
              </div>
            </div>

            {/* Row 2: Organization & Type pills, Sort */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                {/* Organization pills */}
                {organizations.length > 1 && (
                  <>
                    {organizations.map((org) => (
                      <button
                        key={org}
                        onClick={() =>
                          updateFilters({
                            org: orgFilter === org ? null : org,
                          })
                        }
                        className={cn(
                          "px-3 py-1.5 text-xs font-bold rounded-lg border transition-all",
                          orgFilter === org
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-zinc-600 border-zinc-200 hover:border-blue-300 hover:text-blue-600",
                        )}
                      >
                        {org}
                      </button>
                    ))}
                    {organizations.length > 0 && meetingTypes.length > 1 && (
                      <div className="w-px h-5 bg-zinc-200 mx-1 hidden sm:block" />
                    )}
                  </>
                )}

                {/* Type pills */}
                {meetingTypes.length > 1 &&
                  meetingTypes.map((type) => (
                    <button
                      key={type}
                      onClick={() =>
                        updateFilters({
                          type: typeFilter === type ? null : type,
                        })
                      }
                      className={cn(
                        "px-3 py-1.5 text-xs font-bold rounded-lg border transition-all",
                        typeFilter === type
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-zinc-600 border-zinc-200 hover:border-indigo-300 hover:text-indigo-600",
                      )}
                    >
                      {type}
                    </button>
                  ))}
              </div>

              {/* Sort */}
              <div className="flex items-center gap-2 shrink-0">
                <ArrowUpDown className="h-3.5 w-3.5 text-zinc-400" />
                <select
                  value={sortOrder}
                  onChange={(e) => updateFilters({ sort: e.target.value })}
                  className="text-xs font-bold text-zinc-600 bg-white border border-zinc-200 rounded-lg px-3 py-1.5 focus:outline-none cursor-pointer"
                >
                  <option value="desc">Newest first</option>
                  <option value="asc">Oldest first</option>
                </select>
              </div>
            </div>

            {/* Results count & clear */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-zinc-400" />
              <span className="text-sm font-medium text-zinc-500">
                Found{" "}
                <span className="text-zinc-900 font-bold">
                  {filteredMeetingsForList.length}
                </span>{" "}
                records
              </span>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="ml-2 text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <X className="h-3 w-3" />
                  Clear filters
                </button>
              )}
            </div>

            {/* List Results */}
            <div className="flex flex-col gap-4 w-full min-h-[300px]">
              {filteredMeetingsForList.length === 0 ? (
                <div className="text-center py-24 bg-white rounded-2xl border border-zinc-200 border-dashed">
                  <div className="bg-zinc-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search className="h-8 w-8 text-zinc-300" />
                  </div>
                  <h3 className="text-lg font-bold text-zinc-900 mb-1">
                    No records found
                  </h3>
                  <p className="text-zinc-500 max-w-xs mx-auto mb-6">
                    No meetings matching your criteria were found for{" "}
                    {selectedYear}.
                  </p>
                  <button
                    onClick={clearFilters}
                    className="text-sm font-bold text-blue-600 hover:underline"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                filteredMeetingsForList.map((meeting) => (
                  <MeetingCard key={meeting.id} meeting={meeting} />
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
