import { useMemo, useState } from "react";
import type { Route } from "./+types/person-proposals";
import { getPersonProposals } from "../services/people";
import { Link, useSearchParams } from "react-router";
import {
  ChevronLeft,
  ChevronRight,
  Gavel,
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

export async function loader({ params, request }: Route.LoaderArgs) {
  const { id } = params;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "0", 10);
  const roleFilter = url.searchParams.get("role") || "All";
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

    // 2. Fetch motions based on role
    let motions: any[] = [];
    let totalCount = 0;

    if (roleFilter === "All" || roleFilter === "Mover") {
      const { data, count } = await supabase
        .from("motions")
        .select(
          "id, text_content, result, meeting_id, meetings(id, title, meeting_date)",
          { count: "exact" },
        )
        .eq("mover_id", id)
        .order("meeting_id", { ascending: false });

      if (data) motions.push(...data.map((m) => ({ ...m, role: "Mover" })));
      if (roleFilter === "Mover") totalCount = count || 0;
    }

    if (roleFilter === "All" || roleFilter === "Seconder") {
      const { data, count } = await supabase
        .from("motions")
        .select(
          "id, text_content, result, meeting_id, meetings(id, title, meeting_date)",
          { count: "exact" },
        )
        .eq("seconder_id", id)
        .order("meeting_id", { ascending: false });

      if (data) motions.push(...data.map((m) => ({ ...m, role: "Seconder" })));
      if (roleFilter === "Seconder") totalCount = count || 0;
    }

    // Manual merge and paginate if "All" is selected
    if (roleFilter === "All") {
      motions.sort((a, b) =>
        b.meetings.meeting_date.localeCompare(a.meetings.meeting_date),
      );
      totalCount = motions.length;
      motions = motions.slice(page * pageSize, (page + 1) * pageSize);
    } else {
      // If specific role, it's already sorted by ID/Meeting, but let's re-sort by date to be sure
      motions.sort((a, b) =>
        b.meetings.meeting_date.localeCompare(a.meetings.meeting_date),
      );
      motions = motions.slice(page * pageSize, (page + 1) * pageSize);
    }

    return {
      person,
      motions,
      total: totalCount,
      page,
      pageSize,
      currentRole: roleFilter,
    };
  } catch (error: any) {
    console.error("Error loading proposals:", error);
    throw new Response("Error loading legislative proposals", { status: 500 });
  }
}

export default function PersonProposals({ loaderData }: Route.ComponentProps) {
  const { person, motions, total, page, pageSize, currentRole } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();

  const totalPages = Math.ceil(total / pageSize);

  const handleRoleChange = (role: string) => {
    setSearchParams({ role, page: "0" });
  };

  const handlePageChange = (newPage: number) => {
    setSearchParams({ role: currentRole, page: newPage.toString() });
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
            <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-200">
              <Gavel className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-zinc-900">
              Legislative Proposals
            </h1>
          </div>
          <p className="text-zinc-500 font-medium">
            Motions moved or seconded by{" "}
            <span className="text-zinc-900 font-bold">{person.name}</span>.
          </p>
        </header>

        {/* Filter Bar */}
        <Card className="mb-8 border-none shadow-sm ring-1 ring-zinc-200 bg-white p-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="px-3 flex items-center gap-2 text-xs font-black uppercase text-zinc-400 border-r border-zinc-100 mr-1">
              <Filter className="h-3.5 w-3.5" /> Role
            </div>
            {(["All", "Mover", "Seconder"] as const).map((f) => (
              <Button
                key={f}
                variant={currentRole === f ? "default" : "ghost"}
                size="sm"
                onClick={() => handleRoleChange(f)}
                className={cn(
                  "h-8 text-xs rounded-lg px-4 font-bold transition-all",
                  currentRole === f
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
          {motions.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-zinc-200">
              <Gavel className="h-12 w-12 text-zinc-200 mx-auto mb-4" />
              <p className="text-zinc-500 italic font-medium">
                No motions found for this role.
              </p>
            </div>
          ) : (
            motions.map((m: any, idx) => (
              <div
                key={`${m.id}-${idx}`}
                className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm hover:border-indigo-400 transition-all group flex flex-col md:flex-row gap-6"
              >
                <div className="shrink-0 flex flex-col items-center justify-center bg-zinc-50 rounded-xl px-4 py-3 md:w-24 border border-zinc-100 h-fit">
                  <Gavel className="h-4 w-4 text-zinc-400" />
                  <span className="text-[10px] font-black uppercase mt-1 tracking-wider text-zinc-500">
                    {m.role}
                  </span>
                </div>

                <div className="flex-1 space-y-3 min-w-0">
                  <div className="flex items-center gap-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(m.meetings?.meeting_date)}</span>
                    </div>
                    <Separator orientation="vertical" className="h-3" />
                    <span className="text-blue-600 truncate">
                      {m.meetings?.title}
                    </span>
                  </div>

                  <p className="text-sm font-bold text-zinc-800 leading-relaxed group-hover:text-zinc-900 transition-colors">
                    {m.text_content}
                  </p>

                  <div className="flex items-center justify-between pt-2 border-t border-zinc-50 mt-2">
                    <Link
                      to={`/meetings/${m.meeting_id}`}
                      className="text-xs font-black text-blue-600 hover:text-blue-700 flex items-center gap-1 group-hover:gap-2 transition-all uppercase tracking-tighter"
                    >
                      View Decision record
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                    {m.result && (
                      <Badge
                        variant={
                          m.result === "CARRIED" ? "default" : "destructive"
                        }
                        className="text-[9px] font-black h-5 px-2 uppercase tracking-tighter"
                      >
                        Motion {m.result}
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
