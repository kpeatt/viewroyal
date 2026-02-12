import type { Route } from "./+types/election-detail";
import { getElectionById } from "../services/elections";
import { getSupabaseAdminClient } from "../lib/supabase.server";
import { Link } from "react-router";

export const meta: Route.MetaFunction = ({ data }) => {
  if (!data?.election) return [{ title: "Election | ViewRoyal.ai" }];
  const e = data.election as any;
  const title = `${e.name} | ViewRoyal.ai`;
  const description = e.notes || `${e.classification} — ${e.election_date}`;
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: e.name },
    { property: "og:description", content: description },
    { property: "og:type", content: "article" },
    { name: "twitter:card", content: "summary" },
  ];
};
import {
  ChevronLeft,
  Gavel,
  Calendar,
  Users,
  Trophy,
  User,
  CheckCircle2,
  TrendingUp,
  Award,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { formatDate, cn } from "../lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Separator } from "../components/ui/separator";

export async function loader({ params }: Route.LoaderArgs) {
  const { id } = params;

  try {
    const supabase = getSupabaseAdminClient();
    const election = await getElectionById(supabase, id);
    return { election };
  } catch (error) {
    console.error("Error fetching election:", error);
    throw new Response("Election Not Found", { status: 404 });
  }
}

export default function ElectionDetail({ loaderData }: Route.ComponentProps) {
  const { election } = loaderData;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="container mx-auto py-8 px-4 max-w-5xl">
        <Link
          to="/elections"
          className="group flex items-center text-sm font-medium text-zinc-600 hover:text-blue-600 mb-6 transition-colors"
        >
          <ChevronLeft className="mr-1 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          Back to Elections
        </Link>

        <header className="mb-12 bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Gavel className="h-32 w-32" />
          </div>

          <div className="relative">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <Badge className="bg-blue-50 text-blue-700 border-blue-100 px-3 py-1">
                {election.classification || "General Election"}
              </Badge>
              <div className="flex items-center gap-1.5 text-zinc-400 text-sm font-medium">
                <Calendar className="h-4 w-4" />
                {formatDate(election.election_date)}
              </div>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 mb-4">
              {election.name}
            </h1>
            {election.notes && (
              <p className="text-lg text-zinc-600 leading-relaxed max-w-2xl">
                {election.notes}
              </p>
            )}
          </div>
        </header>

        <div className="space-y-12">
          {election.election_offices
            ?.sort((a: any, b: any) => a.office.localeCompare(b.office))
            .map((office: any) => {
              const winners =
                office.candidacies?.filter((c: any) => c.is_elected) || [];
              const others =
                office.candidacies?.filter((c: any) => !c.is_elected) || [];
              const sortedCandidates = [...(office.candidacies || [])].sort(
                (a: any, b: any) =>
                  (b.votes_received || 0) - (a.votes_received || 0),
              );
              const totalVotes = sortedCandidates.reduce(
                (acc, c) => acc + (c.votes_received || 0),
                0,
              );

              return (
                <section key={office.id}>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-zinc-900 rounded-xl">
                        <Award className="h-5 w-5 text-white" />
                      </div>
                      <h2 className="text-2xl font-bold text-zinc-900">
                        {office.office}
                      </h2>
                      <Badge variant="outline" className="ml-2">
                        {office.seats_available}{" "}
                        {office.seats_available === 1 ? "Seat" : "Seats"}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sortedCandidates.map((c: any) => {
                      const person = c.people;
                      const votePercent =
                        totalVotes > 0
                          ? (
                              ((c.votes_received || 0) / totalVotes) *
                              100
                            ).toFixed(1)
                          : null;

                      return (
                        <Card
                          key={c.id}
                          className={cn(
                            "overflow-hidden border-2 transition-all duration-300",
                            c.is_elected
                              ? "border-green-500 shadow-md ring-1 ring-green-100"
                              : "border-zinc-200 shadow-sm hover:border-zinc-300",
                          )}
                        >
                          <CardHeader className="p-4 pb-0">
                            <div className="flex justify-between items-start mb-4">
                              <div className="h-12 w-12 rounded-full bg-zinc-100 border border-zinc-200 overflow-hidden shrink-0">
                                {person?.image_url ? (
                                  <img
                                    src={person.image_url}
                                    alt={person.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-zinc-300">
                                    <User className="h-6 w-6" />
                                  </div>
                                )}
                              </div>
                              {c.is_elected && (
                                <Badge className="bg-green-600 hover:bg-green-600 text-white flex items-center gap-1">
                                  <Trophy className="h-3 w-3" />
                                  Elected
                                </Badge>
                              )}
                              {c.is_acclaimed && (
                                <Badge
                                  variant="secondary"
                                  className="bg-blue-50 text-blue-700 border-blue-100"
                                >
                                  Acclaimed
                                </Badge>
                              )}
                            </div>
                            <CardTitle className="text-lg font-bold">
                              <Link
                                to={`/people/${c.person_id}`}
                                className="hover:text-blue-600 transition-colors"
                              >
                                {person?.name}
                              </Link>
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-4 pt-4 space-y-4">
                            <div className="flex justify-between items-end">
                              <div>
                                <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest leading-none mb-1">
                                  Votes Received
                                </div>
                                <div className="text-2xl font-black text-zinc-900">
                                  {c.votes_received?.toLocaleString() || "N/A"}
                                </div>
                              </div>
                              {votePercent && (
                                <div className="text-right">
                                  <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest leading-none mb-1">
                                    Vote Share
                                  </div>
                                  <div className="text-lg font-bold text-blue-600">
                                    {votePercent}%
                                  </div>
                                </div>
                              )}
                            </div>

                            {votePercent && (
                              <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all duration-1000",
                                    c.is_elected
                                      ? "bg-green-600"
                                      : "bg-blue-600",
                                  )}
                                  style={{ width: `${votePercent}%` }}
                                />
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              );
            })}
        </div>
      </div>
    </div>
  );
}
