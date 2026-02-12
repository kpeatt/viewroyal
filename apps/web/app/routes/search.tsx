import type { Route } from "./+types/search";
import {
  globalSearch,
  type SearchMode,
  type SearchResults,
} from "../services/search";
import { isVectorSearchAvailable } from "../lib/embeddings.server";
import { getSupabaseAdminClient } from "../lib/supabase.server";
import { Link, useSearchParams } from "react-router";
import {
  Search as SearchIcon,
  Calendar,
  MessageSquare,
  FileText,
  ChevronRight,
  User,
  ExternalLink,
  ArrowRight,
  Loader2,
  Sparkles,
  Type,
  Zap,
  Brain,
  Gavel,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { formatDate, cn } from "../lib/utils";
import { useEffect, useState } from "react";
import { Input } from "../components/ui/input";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  const mode = (url.searchParams.get("mode") as SearchMode) || "auto";
  const types = url.searchParams.getAll("type");
  const vectorAvailable = isVectorSearchAvailable();

  const filters = {
    meetings: types.length === 0 || types.includes("meetings"),
    items: types.length === 0 || types.includes("items"),
    segments: types.length === 0 || types.includes("segments"),
    motions: types.length === 0 || types.includes("motions"),
  };

  if (!q || q.length < 2) {
    return {
      results: {
        meetings: [],
        items: [],
        segments: [],
        motions: [],
        searchMethod: "keyword" as const,
      },
      query: q || "",
      mode,
      filters,
      vectorAvailable,
    };
  }

  try {
    const supabase = getSupabaseAdminClient();
    const results = await globalSearch(supabase, q, { mode, filters });
    return { query: q, results, mode, filters, vectorAvailable };
  } catch (error) {
    console.error("Search error:", error);
    return {
      results: {
        meetings: [],
        items: [],
        segments: [],
        motions: [],
        searchMethod: "keyword" as const,
      },
      query: q,
      mode,
      filters,
      vectorAvailable,
    };
  }
}

function SimilarityBadge({ similarity }: { similarity?: number }) {
  if (!similarity) return null;
  const percent = Math.round(similarity * 100);
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-violet-100 text-violet-700 border border-violet-200">
      <Sparkles className="h-2.5 w-2.5" />
      {percent}%
    </span>
  );
}

function SearchMethodIndicator({
  method,
}: {
  method: SearchResults["searchMethod"];
}) {
  const config = {
    keyword: {
      label: "Keyword Search",
      icon: <Type className="h-3 w-3" />,
      color: "text-zinc-500",
    },
    vector: {
      label: "Semantic Search",
      icon: <Sparkles className="h-3 w-3" />,
      color: "text-violet-600",
    },
    hybrid: {
      label: "Hybrid Search",
      icon: <Zap className="h-3 w-3" />,
      color: "text-blue-600",
    },
    analysis: {
      label: "AI Analysis",
      icon: <Brain className="h-3 w-3" />,
      color: "text-teal-600",
    },
  };
  const c = config[method];
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest",
        c.color,
      )}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

function SearchFilters({
  filters,
  onChange,
}: {
  filters: {
    meetings: boolean;
    items: boolean;
    segments: boolean;
    motions: boolean;
  };
  onChange: (key: keyof typeof filters) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <FilterButton
        label="Meetings"
        active={filters.meetings}
        onClick={() => onChange("meetings")}
        icon={Calendar}
      />
      <FilterButton
        label="Motions"
        active={filters.motions}
        onClick={() => onChange("motions")}
        icon={Gavel}
      />
      <FilterButton
        label="Items"
        active={filters.items}
        onClick={() => onChange("items")}
        icon={FileText}
      />
      <FilterButton
        label="Transcripts"
        active={filters.segments}
        onClick={() => onChange("segments")}
        icon={MessageSquare}
      />
    </div>
  );
}

function FilterButton({
  label,
  active,
  onClick,
  icon: Icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border",
        active
          ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm"
          : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300",
      )}
    >
      <Icon
        className={cn(
          "h-3.5 w-3.5",
          active ? "text-blue-500" : "text-zinc-400",
        )}
      />
      {label}
    </button>
  );
}

export default function Search({ loaderData }: Route.ComponentProps) {
  const { results, query, filters, vectorAvailable } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const [localQuery, setLocalQuery] = useState(query);
  const [localFilters, setLocalFilters] = useState(filters);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    setIsSearching(false);
  }, [results]);

  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const performSearch = (q: string, f: typeof localFilters) => {
    if (q.trim().length >= 2) {
      setIsSearching(true);
      const params = new URLSearchParams();
      params.set("q", q);

      // Only append types if some are unchecked (filtering is active)
      const allSelected = Object.values(f).every(Boolean);
      if (!allSelected) {
        Object.entries(f).forEach(([key, value]) => {
          if (value) params.append("type", key);
        });
      }

      setSearchParams(params);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(localQuery, localFilters);
  };

  const handleFilterChange = (key: keyof typeof localFilters) => {
    const newFilters = { ...localFilters, [key]: !localFilters[key] };
    setLocalFilters(newFilters);
    // Don't auto-search on filter toggle to avoid too many requests?
    // Or do we want immediate feedback? Let's do immediate if query exists.
    if (localQuery) {
      performSearch(localQuery, newFilters);
    }
  };

  const totalResults =
    (results.meetings?.length ?? 0) +
    (results.items?.length ?? 0) +
    (results.segments?.length ?? 0) +
    (results.motions?.length ?? 0);

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="container mx-auto py-12 px-4 max-w-4xl">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 mb-6 flex items-center justify-center gap-3">
            <SearchIcon className="h-8 w-8 text-blue-600" />
            Global Search
          </h1>

          <form onSubmit={handleSearch} className="max-w-2xl mx-auto space-y-4">
            <div className="relative group">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400 group-focus-within:text-blue-600 transition-colors" />
              <Input
                type="text"
                placeholder="Search meetings, motions, or transcript text..."
                value={localQuery}
                onChange={(e) => setLocalQuery(e.target.value)}
                className="pl-12 h-14 bg-white border-zinc-200 text-lg rounded-2xl shadow-sm focus:ring-4 focus:ring-blue-500/10 transition-all"
              />
              {isSearching && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-3">
              <SearchFilters
                filters={localFilters}
                onChange={handleFilterChange}
              />
            </div>
          </form>
        </div>

        {!query ? (
          <div className="text-center py-24 space-y-4">
            <div className="w-20 h-20 bg-zinc-100 rounded-full flex items-center justify-center mx-auto">
              <SearchIcon className="h-10 w-10 text-zinc-300" />
            </div>
            <p className="text-zinc-500 text-lg">
              Enter a search term to explore the archive.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-8">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                Suggestions:
              </span>
              {["Bylaw", "Zoning", "Lake", "Grant", "Traffic"].map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setLocalQuery(s);
                    performSearch(s, localFilters);
                  }}
                  className="text-xs font-bold text-blue-600 hover:underline"
                >
                  {s}
                </button>
              ))}
            </div>
            {vectorAvailable && (
              <p className="text-xs text-violet-600 mt-4 flex items-center justify-center gap-1">
                <Sparkles className="h-3 w-3" />
                Semantic search enabled - try natural language queries like
                "discussions about traffic safety"
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-12">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-400">
                {totalResults} Results for "{query}"
              </h2>
              <SearchMethodIndicator method={results.searchMethod} />
            </div>

            {/* AI Analysis Result */}
            {results.analysis && (
              <section className="p-6 bg-teal-50/50 border-2 border-dashed border-teal-200 rounded-2xl">
                <h3 className="text-lg font-bold text-teal-900 flex items-center gap-2 mb-3">
                  <Brain className="h-5 w-5 text-teal-600" />
                  Political Analysis
                </h3>
                <div className="prose prose-sm max-w-none text-teal-800 whitespace-pre-wrap">
                  {results.analysis}
                </div>
              </section>
            )}

            {/* Motions */}
            {results.motions?.length > 0 && (
              <section className="space-y-4">
                <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                  <Gavel className="h-5 w-5 text-violet-600" />
                  Motions & Decisions
                </h3>
                <div className="space-y-4">
                  {results.motions.map((m) => (
                    <Link
                      key={m.id}
                      to={`/meetings/${m.meeting_id}`}
                      className="block p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm hover:border-violet-200 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Badge
                          variant={
                            m.result === "CARRIED" ? "secondary" : "outline"
                          }
                          className={cn(
                            "text-[10px] font-bold",
                            m.result === "CARRIED"
                              ? "bg-green-100 text-green-700 hover:bg-green-100"
                              : "text-zinc-500",
                          )}
                        >
                          {m.result || "MOTION"}
                        </Badge>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                          {formatDate(m.meetings?.meeting_date ?? "")}
                        </span>
                        <SimilarityBadge similarity={m.similarity} />
                      </div>
                      <p className="text-sm font-medium text-zinc-900 group-hover:text-violet-700 transition-colors leading-relaxed">
                        {m.text_content}
                      </p>
                      {(m.mover || m.seconder) && (
                        <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
                          {m.mover && <span>Moved by: {m.mover}</span>}
                          {m.seconder && <span>Seconded by: {m.seconder}</span>}
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Meetings */}
            {results.meetings?.length > 0 && (
              <section className="space-y-4">
                <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  Meetings
                </h3>
                <div className="grid gap-4">
                  {results.meetings.map((m) => (
                    <Link
                      key={m.id}
                      to={`/meetings/${m.id}`}
                      className="p-4 bg-white rounded-xl border border-zinc-200 shadow-sm hover:border-blue-200 hover:shadow-md transition-all flex items-center justify-between group"
                    >
                      <div>
                        <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
                          {formatDate(m.meeting_date)}
                        </div>
                        <div className="font-bold text-zinc-900 group-hover:text-blue-600 transition-colors">
                          {m.title}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-zinc-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Agenda Items */}
            {results.items?.length > 0 && (
              <section className="space-y-4">
                <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-amber-500" />
                  Agenda Items & Matters
                </h3>
                <div className="space-y-4">
                  {results.items.map((item) => (
                    <Link
                      key={item.id}
                      to={`/meetings/${item.meeting_id}`}
                      className="block p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm hover:border-amber-200 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Badge
                          variant="secondary"
                          className="text-[10px] font-bold"
                        >
                          {item.meetings?.organizations?.name}
                        </Badge>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                          {formatDate(item.meetings?.meeting_date ?? "")}
                        </span>
                        <SimilarityBadge similarity={item.similarity} />
                      </div>
                      <h4 className="text-lg font-bold text-zinc-900 group-hover:text-amber-600 transition-colors mb-2">
                        {item.title}
                      </h4>
                      {item.description && (
                        <p className="text-sm text-zinc-500 line-clamp-2 leading-relaxed italic">
                          "{item.description}"
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Transcript Snippets */}
            {results.segments?.length > 0 && (
              <section className="space-y-4">
                <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-emerald-500" />
                  Transcript Mentions
                </h3>
                <div className="space-y-4">
                  {results.segments.map((seg) => (
                    <Link
                      key={seg.id}
                      to={`/meetings/${seg.meeting_id}#t=${seg.start_time}`}
                      className="block p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm hover:border-emerald-200 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-emerald-50 flex items-center justify-center border border-emerald-100">
                            <User className="h-3 w-3 text-emerald-600" />
                          </div>
                          <span className="text-xs font-black text-emerald-700 uppercase tracking-tight">
                            {seg.person?.name || seg.speaker_name || "Speaker"}
                          </span>
                          <SimilarityBadge similarity={seg.similarity} />
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-mono font-bold text-zinc-400">
                          {formatDate(seg.meetings?.meeting_date ?? "")}
                          <ExternalLink className="h-2 w-2" />
                        </div>
                      </div>
                      <p className="text-sm text-zinc-700 leading-relaxed">
                        {seg.source === "keyword" ? (
                          <HighlightText
                            text={seg.text_content}
                            query={query}
                          />
                        ) : (
                          seg.text_content
                        )}
                      </p>
                      <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                        <div className="px-2 py-0.5 bg-zinc-50 rounded border border-zinc-100">
                          {seg.meetings?.title}
                        </div>
                        <ArrowRight className="h-3 w-3" />
                        <span className="text-blue-600 hover:underline">
                          Jump to moment
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {totalResults === 0 && (
              <div className="text-center py-24">
                <p className="text-zinc-500 italic">
                  No results found for "{query}". Try a different term.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={i}
            className="bg-amber-200 text-zinc-900 rounded-sm px-0.5 font-semibold"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
