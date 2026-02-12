import type { Route } from "./+types/elections";
import { getElections } from "../services/elections";
import { getSupabaseAdminClient } from "../lib/supabase.server";
import { Link } from "react-router";
import { Gavel, ChevronRight, Calendar, Users, Trophy } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { formatDate } from "../lib/utils";

export async function loader() {
  try {
    const supabase = getSupabaseAdminClient();
    const elections = await getElections(supabase);
    return { elections };
  } catch (error) {
    console.error("Error fetching elections:", error);
    return { elections: [] };
  }
}

export default function Elections({ loaderData }: Route.ComponentProps) {
  const { elections } = loaderData;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="container mx-auto py-12 px-4 max-w-5xl">
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Gavel className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900">
              Elections Archive
            </h1>
          </div>
          <p className="text-xl text-zinc-500 max-w-2xl">
            Historical election results, candidate performance, and governance
            transitions in View Royal.
          </p>
        </header>

        <div className="grid gap-8">
          {elections.map((election: any) => {
            const totalCandidates =
              election.election_offices?.reduce(
                (acc: number, office: any) =>
                  acc + (office.candidacies?.length || 0),
                0,
              ) || 0;
            const electedCount =
              election.election_offices?.reduce(
                (acc: number, office: any) =>
                  acc +
                  (office.candidacies?.filter((c: any) => c.is_elected)
                    .length || 0),
                0,
              ) || 0;

            return (
              <Link
                key={election.id}
                to={`/elections/${election.id}`}
                className="group block bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden hover:shadow-xl hover:border-blue-200 transition-all duration-300"
              >
                <div className="p-8">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Badge className="bg-blue-50 text-blue-700 border-blue-100 px-3 py-1">
                          {election.classification || "General Election"}
                        </Badge>
                        <div className="flex items-center gap-1.5 text-zinc-400 text-sm font-medium">
                          <Calendar className="h-4 w-4" />
                          {formatDate(election.election_date)}
                        </div>
                      </div>
                      <h2 className="text-3xl font-bold text-zinc-900 group-hover:text-blue-600 transition-colors">
                        {election.name}
                      </h2>
                      <div className="flex flex-wrap gap-6">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-zinc-50 flex items-center justify-center border border-zinc-100">
                            <Users className="h-4 w-4 text-zinc-400" />
                          </div>
                          <div>
                            <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest leading-none">
                              Candidates
                            </div>
                            <div className="text-sm font-bold text-zinc-700">
                              {totalCandidates}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-zinc-50 flex items-center justify-center border border-zinc-100">
                            <Trophy className="h-4 w-4 text-amber-500" />
                          </div>
                          <div>
                            <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest leading-none">
                              Seats Filled
                            </div>
                            <div className="text-sm font-bold text-zinc-700">
                              {electedCount}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-blue-600 font-bold group-hover:translate-x-1 transition-transform">
                      View Results
                      <ChevronRight className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
