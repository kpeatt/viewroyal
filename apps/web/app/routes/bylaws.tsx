import type { Route } from "./+types/bylaws";
import { getBylaws } from "../services/bylaws";
import { getSupabaseAdminClient } from "../lib/supabase.server";
import { Link, useRouteLoaderData } from "react-router";
import type { Municipality } from "../lib/types";
import {
  Book,
  Search,
  Filter,
  FileText,
  ChevronRight,
  Gavel,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { useState, useMemo } from "react";
import { cn } from "../lib/utils";

export async function loader() {
  try {
    const supabase = getSupabaseAdminClient();
    const bylaws = await getBylaws(supabase);
    return { bylaws };
  } catch (error) {
    console.error("Error fetching bylaws:", error);
    return { bylaws: [] };
  }
}

export default function Bylaws({ loaderData }: Route.ComponentProps) {
  const { bylaws } = loaderData;
  const rootData = useRouteLoaderData("root") as { municipality?: Municipality } | undefined;
  const municipalityName = rootData?.municipality?.name || "Town of View Royal";
  const [filterText, setFilterText] = useState("");

  const filteredBylaws = useMemo(() => {
    if (!filterText) return bylaws;
    const lower = filterText.toLowerCase();
    return bylaws.filter(
      (b) =>
        b.title.toLowerCase().includes(lower) ||
        b.bylaw_number?.toLowerCase().includes(lower) ||
        b.plain_english_summary?.toLowerCase().includes(lower),
    );
  }, [bylaws, filterText]);

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="container mx-auto py-12 px-4 max-w-6xl">
        <header className="mb-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-zinc-900 rounded-lg">
                <Book className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900">
                Bylaws & Policies
              </h1>
            </div>

            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="Search bylaws..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="pl-10 bg-white border-zinc-200"
              />
            </div>
          </div>
          <p className="text-xl text-zinc-500 max-w-2xl">
            Browse and search the official regulations, plans, and policies of
            the {municipalityName}.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredBylaws.length === 0 ? (
            <div className="col-span-full text-center py-24 bg-white rounded-2xl border border-dashed border-zinc-200">
              <Filter className="h-12 w-12 text-zinc-200 mx-auto mb-4" />
              <p className="text-zinc-500 text-lg">
                No bylaws match your search.
              </p>
            </div>
          ) : (
            filteredBylaws.map((bylaw) => (
              <Link
                key={bylaw.id}
                to={`/bylaws/${bylaw.id}`}
                className="group flex flex-col bg-white rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all overflow-hidden h-full"
              >
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {bylaw.bylaw_number ? (
                        <Badge
                          variant="outline"
                          className="font-mono font-bold border-zinc-200 text-zinc-600 bg-zinc-50"
                        >
                          No. {bylaw.bylaw_number}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-zinc-200 text-zinc-400"
                        >
                          Policy
                        </Badge>
                      )}
                      {bylaw.year && (
                        <span className="text-xs font-medium text-zinc-400">
                          {bylaw.year}
                        </span>
                      )}
                    </div>
                    {bylaw.status !== "Active" && (
                      <span className="text-[10px] uppercase font-black tracking-widest text-red-500 bg-red-50 px-2 py-0.5 rounded">
                        {bylaw.status}
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-zinc-900 group-hover:text-blue-600 transition-colors mb-3 leading-tight">
                    {bylaw.title}
                  </h3>

                  {bylaw.plain_english_summary ? (
                    <p className="text-sm text-zinc-500 line-clamp-3 leading-relaxed">
                      {bylaw.plain_english_summary}
                    </p>
                  ) : (
                    <p className="text-sm text-zinc-300 italic">
                      No summary available.
                    </p>
                  )}
                </div>

                <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between text-xs font-medium text-zinc-500 group-hover:bg-blue-50/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5" />
                    <span>View Detail</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
