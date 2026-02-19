import { useMemo, useState } from "react";
import type { Route } from "./+types/person-votes";
import { getRawPeopleData } from "../services/people";
import { Link, useSearchParams } from "react-router";
import {
  ChevronLeft,
  ChevronRight,
  Vote as VoteIcon,
  ThumbsUp,
  ThumbsDown,
  MinusCircle,
  AlertCircle,
  ArrowRight,
  Filter,
  Calendar,
} from "lucide-react";
import { Separator } from "../components/ui/separator";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { cn, formatDate } from "../lib/utils";
import { getSupabaseAdminClient } from "../lib/supabase.server";

export const meta: Route.MetaFunction = ({ data }) => {
  const person = (data as any)?.person;
  if (!person) return [{ title: "Voting Record | ViewRoyal.ai" }];
  const title = `${person.name} — Voting Record | ViewRoyal.ai`;
  const description = `Complete voting record for ${person.name} on View Royal council`;
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: `${person.name} — Voting Record` },
    { property: "og:description", content: description },
    { property: "og:type", content: "profile" },
    { property: "og:image", content: "https://viewroyal.ai/og-image.png" },
    { name: "twitter:card", content: "summary_large_image" },
  ];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const { id } = params;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "0", 10);
  const voteFilter = url.searchParams.get("filter") || "All";
  const pageSize = 50;

  try {
    const supabase = getSupabaseAdminClient();
    // 1. Fetch person basic info
    const { data: person } = await supabase
      .from("people")
      .select("id, name")
      .eq("id", id)
      .single();

    if (!person) throw new Response("Person Not Found", { status: 404 });

    // 2. Fetch votes with simple filter applied at DB level if possible,
    // but our service currently filters in JS for complex logic.
    // Let's refine the service to handle basic filters.

    let query = supabase
      .from("votes")
      .select(
        "id, motion_id, person_id, vote, recusal_reason, created_at, motions(id, text_content, result, meeting_id, meetings(id, title, meeting_date))",
        { count: "exact" },
      )
      .eq("person_id", id)
      .order("created_at", { ascending: false });

    if (voteFilter !== "All") {
      query = query.eq("vote", voteFilter);
    }

    const {
      data: votes,
      count,
      error,
    } = await query.range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw error;

    return {
      person,
      votes: votes || [],
      total: count || 0,
      page,
      pageSize,
      currentFilter: voteFilter,
    };
  } catch (error: any) {
    console.error("Error loading votes:", error);
    throw new Response("Error loading voting record", { status: 500 });
  }
}

export default function PersonVotes({ loaderData }: Route.ComponentProps) {
  const { person, votes, total, page, pageSize, currentFilter } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();

  const totalPages = Math.ceil(total / pageSize);

  const handleFilterChange = (filter: string) => {
    setSearchParams({ filter, page: "0" });
  };

  const handlePageChange = (newPage: number) => {
    setSearchParams({ filter: currentFilter, page: newPage.toString() });
  };

  const getVoteIcon = (vote: string) => {
    switch (vote) {
      case "Yes":
        return <ThumbsUp className="h-4 w-4 text-green-600" />;
      case "No":
        return <ThumbsDown className="h-4 w-4 text-red-600" />;
      case "Abstain":
        return <MinusCircle className="h-4 w-4 text-zinc-400" />;
      case "Recused":
        return <AlertCircle className="h-4 w-4 text-amber-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <Link
          to={`/people/${person.id}`}
          className="inline-flex items-center text-sm font-bold text-zinc-500 hover:text-blue-600 mb-8 transition-colors"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to {person.name}'s Profile
        </Link>

        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-200">
              <VoteIcon className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-zinc-900">
              Voting Record
            </h1>
          </div>
          <p className="text-zinc-500 font-medium">
            Complete history of recorded votes cast by{" "}
            <span className="text-zinc-900 font-bold">{person.name}</span>.
          </p>
        </header>

        {/* Filter Bar */}
        <Card className="mb-8 border-none shadow-sm ring-1 ring-zinc-200 bg-white p-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="px-3 flex items-center gap-2 text-xs font-black uppercase text-zinc-400 border-r border-zinc-100 mr-1">
              <Filter className="h-3.5 w-3.5" /> Filter
            </div>
            {(["All", "Yes", "No", "Abstain", "Recused"] as const).map((f) => (
              <Button
                key={f}
                variant={currentFilter === f ? "default" : "ghost"}
                size="sm"
                onClick={() => handleFilterChange(f)}
                className={cn(
                  "h-8 text-xs rounded-lg px-4 font-bold transition-all",
                  currentFilter === f
                    ? "bg-zinc-900 text-white shadow-md"
                    : "text-zinc-500 hover:bg-zinc-100",
                )}
              >
                {f}
              </Button>
            ))}

            <div className="ml-auto px-4 text-xs font-bold text-zinc-400">
              {total.toLocaleString()} Records
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          {votes.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-zinc-200">
              <VoteIcon className="h-12 w-12 text-zinc-200 mx-auto mb-4" />
              <p className="text-zinc-500 italic font-medium">
                No votes found matching this filter.
              </p>
            </div>
          ) : (
            votes.map((v: any) => (
              <div
                key={v.id}
                className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm hover:border-blue-400 transition-all group flex flex-col md:flex-row gap-6"
              >
                <div className="shrink-0 flex flex-col items-center justify-center bg-zinc-50 rounded-xl px-4 py-3 md:w-24 border border-zinc-100 h-fit">
                  {getVoteIcon(v.vote)}
                  <span
                    className={cn(
                      "text-[10px] font-black uppercase mt-1 tracking-wider",
                      v.vote === "Yes"
                        ? "text-green-600"
                        : v.vote === "No"
                          ? "text-red-600"
                          : "text-zinc-500",
                    )}
                  >
                    {v.vote}
                  </span>
                </div>

                <div className="flex-1 space-y-3 min-w-0">
                  <div className="flex items-center gap-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>
                        {formatDate(v.motions?.meetings?.meeting_date)}
                      </span>
                    </div>
                    <Separator orientation="vertical" className="h-3" />
                    <span className="text-blue-600 truncate">
                      {v.motions?.meetings?.title}
                    </span>
                  </div>

                  <p className="text-sm font-bold text-zinc-800 leading-relaxed group-hover:text-zinc-900 transition-colors">
                    {v.motions?.text_content}
                  </p>

                  <div className="flex items-center justify-between pt-2 border-t border-zinc-50 mt-2">
                    <Link
                      to={`/meetings/${v.motions?.meeting_id}`}
                      className="text-xs font-black text-blue-600 hover:text-blue-700 flex items-center gap-1 group-hover:gap-2 transition-all uppercase tracking-tighter"
                    >
                      View Full Meeting
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                    {v.motions?.result && (
                      <Badge
                        variant={
                          v.motions.result === "CARRIED"
                            ? "default"
                            : "destructive"
                        }
                        className="text-[9px] font-black h-5 px-2 uppercase tracking-tighter"
                      >
                        Motion {v.motions.result}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="mt-12 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => handlePageChange(page - 1)}
              className="rounded-xl font-bold"
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>

            <div className="flex items-center gap-1 px-4">
              <span className="text-sm font-black text-zinc-900">
                {page + 1}
              </span>
              <span className="text-xs font-bold text-zinc-400">of</span>
              <span className="text-sm font-black text-zinc-400">
                {totalPages}
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => handlePageChange(page + 1)}
              className="rounded-xl font-bold"
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
