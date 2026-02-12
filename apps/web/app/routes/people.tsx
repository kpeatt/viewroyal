import { useMemo, useState } from "react";
import type { Route } from "./+types/people";

export const meta: Route.MetaFunction = () => [
  { title: "Council Members | ViewRoyal.ai" },
  { name: "description", content: "View Royal council members, attendance records, and voting history." },
  { property: "og:title", content: "Council Members | ViewRoyal.ai" },
  { property: "og:description", content: "View Royal council members, attendance records, and voting history." },
  { name: "twitter:card", content: "summary" },
];
import {
  getRawPeopleData,
  calculateAttendance,
  getElections,
  type PersonWithStats,
} from "../services/people";
import { getSupabaseAdminClient } from "../lib/supabase.server";
import type { Election, Person } from "../lib/types";
import { Link } from "react-router";
import {
  Users,
  Search,
  History,
  Gavel,
  Calendar,
  ChevronRight,
  Vote,
  Activity,
} from "lucide-react";
import { Input } from "../components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import { PersonCard } from "../components/person-card";

export async function loader() {
  try {
    const supabase = getSupabaseAdminClient();
    const [rawData, elections] = await Promise.all([
      getRawPeopleData(supabase),
      getElections(supabase),
    ]);
    return { rawData, elections };
  } catch (error) {
    console.error("Error loading people:", error);
    return { rawData: null, elections: [] };
  }
}

function PeopleGrid({
  people,
  term,
}: {
  people: PersonWithStats[];
  term?: { start: string; end: string };
}) {
  if (people.length === 0) {
    return (
      <div className="text-center py-12 bg-zinc-50 rounded-2xl border border-dashed border-zinc-200 max-w-3xl mx-auto">
        <p className="text-zinc-500 italic text-sm">
          No members found for this period.
        </p>
      </div>
    );
  }

  const getRole = (person: PersonWithStats) => {
    let bestMatchRole = "Member"; // Default role

    if (term) {
      const overlappingMemberships =
        person.memberships?.filter(
          (m) =>
            m.organization?.classification === "Council" &&
            (m.start_date || "0000-01-01") < term.end &&
            (m.end_date || "9999-12-31") > term.start,
        ) || [];

      // Sort to prioritize Mayor, then by start date
      overlappingMemberships.sort((a, b) => {
        const aIsMayor = a.role?.includes("Mayor");
        const bIsMayor = b.role?.includes("Mayor");

        if (aIsMayor && !bIsMayor) return -1;
        if (!aIsMayor && bIsMayor) return 1;

        // If roles are same, sort by start_date (earlier start preferred if multiple)
        return (a.start_date || "").localeCompare(b.start_date || "");
      });

      if (overlappingMemberships.length > 0) {
        bestMatchRole = overlappingMemberships[0].role || "Member";
      }
    } else {
      // Active fallback (for Current Council tab)
      const now = new Date().toISOString().split("T")[0];
      const activeMembership = person.memberships?.find(
        (m) =>
          m.organization?.classification === "Council" &&
          (!m.end_date || m.end_date >= now),
      );
      bestMatchRole = activeMembership?.role || "Member";
    }
    return bestMatchRole;
  };

  // Sort: Mayor first, then Councillors, then alphabetical
  const sortedPeople = [...people].sort((a, b) => {
    const roleA = getRole(a);
    const roleB = getRole(b);

    if (roleA.includes("Mayor") && !roleB.includes("Mayor")) return -1;
    if (!roleA.includes("Mayor") && roleB.includes("Mayor")) return 1;

    return a.name.localeCompare(b.name);
  });

  return (
    <div className="grid grid-cols-1 gap-4 max-w-3xl mx-auto">
      {sortedPeople.map((person) => {
        // Do not render if the person had 0 expected meetings in this term
        if (person.stats.total === 0) return null;

        return (
          <PersonCard key={person.id} person={person} role={getRole(person)} />
        );
      })}
    </div>
  );
}

export default function PeopleList({ loaderData }: Route.ComponentProps) {
  const { rawData, elections } = loaderData;
  const [searchTerm, setSearchTerm] = useState("");

  const people = rawData?.people || [];
  const meetings = rawData?.meetings || [];
  const attendance = rawData?.attendance || [];
  const councilId = rawData?.councilId || 1;

  // Define Terms based on General Elections
  const terms = useMemo(() => {
    // 1. Get only General elections and sort descending
    const generalElections = elections
      .filter((e: Election) => e.classification === "General")
      .sort((a: Election, b: Election) =>
        b.election_date.localeCompare(a.election_date),
      );

    // 2. Create term objects
    return generalElections.map((election: Election, index: number) => {
      const start = election.election_date;
      const nextElection = index > 0 ? generalElections[index - 1] : null;
      const end = nextElection ? nextElection.election_date : "9999-12-31";

      const startYear = start.substring(0, 4);
      const endYear = nextElection
        ? nextElection.election_date.substring(0, 4)
        : Number(startYear) + 4;
      const name = `${startYear}-${endYear} Term`;

      return { id: election.id, name, start, end };
    });
  }, [elections]);

  const { activeCouncil, termHistory } = useMemo(() => {
    if (!rawData) return { activeCouncil: [], termHistory: [] };

    // Helper to calculate stats for a person in a specific range
    const getStats = (p: any, start: string, end: string) =>
      calculateAttendance(p, meetings, attendance, councilId, { start, end });

    // 1. Current Council (Active Members Only)
    // We use the MOST RECENT term (Index 0) for stats
    const currentTerm = terms[0];
    const active = people
      .filter((p) => {
        const now = new Date().toISOString().split("T")[0];
        // Must be currently active (no end date or end date in future)
        return p.memberships?.some((m) => {
          if (m.organization?.classification !== "Council") return false;
          if (!m.end_date) return true;
          return m.end_date >= now;
        });
      })
      .filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .map((p) => ({
        ...p,
        // Stats based on CURRENT TERM (Start of term -> Now)
        stats: getStats(p, currentTerm?.start || "2000-01-01", "9999-12-31"),
      }));

    // 2. Term History
    const history = terms.map((term) => {
      const members = people
        .filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .filter((p) => {
          // Check if they had a council membership overlapping this term
          return p.memberships?.some((m) => {
            if (m.organization?.classification !== "Council") return false;
            const mStart = m.start_date || "0000-01-01";
            const mEnd = m.end_date || "9999-12-31";
            // A member is in a term if their service starts *before* the term ends,
            // AND their service ends *after* the term starts.
            return mStart < term.end && mEnd > term.start;
          });
        })
        .map((p) => ({
          ...p,
          // Stats based strictly on THIS TERM
          stats: getStats(p, term.start, term.end),
        }));

      return { ...term, members };
    });

    return { activeCouncil: active, termHistory: history };
  }, [rawData, terms, searchTerm]);

  if (!rawData) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-zinc-500">Loading council data...</div>
      </div>
    );
  }

  // Next election logic
  const nextElection = elections.find(
    (e: Election) => new Date(e.election_date) > new Date(),
  );
  const nextElectionDate = nextElection
    ? new Date(nextElection.election_date).toLocaleDateString("en-CA", {
        month: "long",
        year: "numeric",
      })
    : "October 2026";

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="container mx-auto py-8 px-4 max-w-5xl">
        <Link
          to="/meetings"
          className="group flex items-center text-sm font-medium text-zinc-600 hover:text-blue-600 mb-6 transition-colors w-fit"
        >
          <ChevronRight className="mr-1 h-4 w-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
          Back to Meetings
        </Link>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 flex items-center gap-3">
              <Users className="h-8 w-8 text-blue-600" />
              Council Dashboard
            </h1>
            <p className="text-zinc-500 mt-1">
              Past and present members of View Royal Council.
            </p>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Search members..."
              className="pl-10 bg-white border-zinc-200"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Council Insights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 max-w-3xl mx-auto">
          <Link
            to="/elections"
            className="group p-5 bg-white rounded-xl border border-zinc-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600 group-hover:scale-110 transition-transform">
                <Vote className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-zinc-900 group-hover:text-blue-600">
                Election History
              </h3>
            </div>
            <p className="text-sm text-zinc-500 mb-3">
              View results from past local elections and by-elections.
            </p>
            <div className="flex items-center text-xs font-bold text-zinc-400 bg-zinc-50 rounded-md px-2 py-1 w-fit">
              Next Election: {nextElectionDate}
            </div>
          </Link>

          <Link
            to="/alignment"
            className="group p-5 bg-white rounded-xl border border-zinc-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 group-hover:scale-110 transition-transform">
                <Activity className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-zinc-900 group-hover:text-indigo-600">
                Voting Alignment
              </h3>
            </div>
            <p className="text-sm text-zinc-500 mb-3">
              Analyze how often council members vote together on motions.
            </p>
            <div className="flex items-center gap-1 text-xs font-bold text-indigo-600">
              View Analysis <ChevronRight className="h-3 w-3" />
            </div>
          </Link>
        </div>

        <Tabs defaultValue="active" className="space-y-6 max-w-3xl mx-auto">
          <TabsList className="bg-zinc-100/50 p-1 border border-zinc-200 w-full justify-start">
            <TabsTrigger
              value="active"
              className="flex-1 md:flex-none data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <Gavel className="h-4 w-4 mr-2" />
              Current Council
              <span className="ml-2 bg-zinc-200 text-zinc-600 text-[10px] px-1.5 py-0.5 rounded-full">
                {activeCouncil.length}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="flex-1 md:flex-none data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <History className="h-4 w-4 mr-2" />
              Previous Terms
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            <PeopleGrid people={activeCouncil} term={terms[0]} />
          </TabsContent>

          <TabsContent value="history" className="space-y-8">
            {termHistory.map((term, index) => {
              if (index === 0) return null; // Skip current term

              return (
                <div key={term.id} className="space-y-3">
                  <div className="flex items-center gap-3 px-2">
                    <div className="p-1.5 bg-zinc-200 rounded-lg">
                      <Calendar className="h-4 w-4 text-zinc-600" />
                    </div>
                    <h3 className="text-lg font-bold text-zinc-900">
                      {term.name}
                    </h3>
                  </div>
                  <PeopleGrid people={term.members} term={term} />
                </div>
              );
            })}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
