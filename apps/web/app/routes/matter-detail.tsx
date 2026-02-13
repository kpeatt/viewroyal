import type { Route } from "./+types/matter-detail";
import { getMatterById } from "../services/matters";
import { getSupabaseAdminClient } from "../lib/supabase.server";
import { Link } from "react-router";

export const meta: Route.MetaFunction = ({ data }) => {
  if (!data?.matter) return [{ title: "Matter | ViewRoyal.ai" }];
  const m = data.matter as any;
  const title = `${m.title} | ViewRoyal.ai`;
  const description = m.plain_english_summary || m.description
    || `${m.category || "Council matter"} — ${m.status || "Active"}`;
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: m.title },
    { property: "og:description", content: description },
    { property: "og:type", content: "article" },
    { property: "og:image", content: "https://viewroyal.ai/og-image.png" },
    { name: "twitter:card", content: "summary_large_image" },
  ];
};
import {
  ChevronLeft,
  ChevronRight,
  Tag,
  Calendar,
  MessageSquare,
  ExternalLink,
  Gavel,
  Clock,
  Info,
  Book,
  FileText,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { formatDate, cn } from "../lib/utils";
import { Separator } from "../components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { ScrollArea } from "../components/ui/scroll-area";
import { MotionCard } from "../components/motion-card";
import { ClientOnly } from "../components/utils/client-only";
import { lazy, Suspense } from "react";

const MattersMap = lazy(() =>
  import("../components/matters-map").then((module) => ({
    default: module.MattersMap,
  })),
);

export async function loader({ params }: Route.LoaderArgs) {
  const { id } = params;

  try {
    const supabase = getSupabaseAdminClient();
    const matter = await getMatterById(supabase, id);
    return { matter };
  } catch (error) {
    console.error("Error fetching matter:", error);
    throw new Response("Matter Not Found", { status: 404 });
  }
}

export default function MatterDetail({ loaderData }: Route.ComponentProps) {
  const { matter } = loaderData;

  // Sort agenda items by meeting date
  const timeline = [...(matter.agenda_items || [])].sort(
    (a, b) =>
      new Date(b.meetings.meeting_date).getTime() -
      new Date(a.meetings.meeting_date).getTime(),
  );

  const lastSeen =
    timeline.length > 0 ? timeline[0].meetings.meeting_date : null;
  const firstSeen =
    timeline.length > 0
      ? timeline[timeline.length - 1].meetings.meeting_date
      : null;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <Link
          to="/matters"
          className="group flex items-center text-sm font-medium text-zinc-600 hover:text-blue-600 mb-6 transition-colors"
        >
          <ChevronLeft className="mr-1 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          Back to Matters
        </Link>

        <header className="mb-12 bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Tag className="h-32 w-32" />
          </div>

          <div className="relative">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {matter.identifier && (
                <Badge className="bg-zinc-900 text-white font-mono font-bold px-3 py-1 text-xs">
                  {matter.identifier}
                </Badge>
              )}
              <Badge
                variant="outline"
                className="border-blue-200 text-blue-700 bg-blue-50/50 px-3 py-1"
              >
                {matter.category || "General"}
              </Badge>
              <span
                className={cn(
                  "text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border",
                  matter.status === "Active"
                    ? "bg-green-50 text-green-700 border-green-100"
                    : "bg-zinc-50 text-zinc-400 border-zinc-200",
                )}
              >
                {matter.status}
              </span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 mb-4">
              {matter.title}
            </h1>
            {matter.description && (
              <p className="text-lg text-zinc-600 leading-relaxed max-w-2xl">
                {matter.description}
              </p>
            )}

            {matter.plain_english_summary && (
              <div className="mt-6 p-5 bg-blue-50 rounded-2xl border border-blue-100 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-4 w-4 text-blue-600" />
                  <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">
                    Plain English Summary
                  </span>
                </div>
                <p className="text-sm text-blue-900 font-medium leading-relaxed">
                  {matter.plain_english_summary}
                </p>
              </div>
            )}

            {matter.bylaw && (
              <div className="mt-6 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-sm text-white overflow-hidden">
                <div className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-zinc-800 rounded-xl shrink-0">
                        <Book className="h-6 w-6 text-zinc-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                            Governing Bylaw
                          </span>
                          {matter.bylaw.bylaw_number && (
                            <Badge
                              variant="outline"
                              className="border-zinc-700 text-zinc-400 text-[10px] h-5"
                            >
                              No. {matter.bylaw.bylaw_number}
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] h-5 border-zinc-700",
                              matter.bylaw.status === "Active"
                                ? "bg-zinc-800 text-zinc-300"
                                : "bg-red-900/30 text-red-300",
                            )}
                          >
                            {matter.bylaw.status}
                          </Badge>
                        </div>
                        <Link
                          to={`/bylaws/${matter.bylaw.id}`}
                          className="text-xl font-bold text-white mb-2 leading-tight hover:text-blue-400 transition-colors block"
                        >
                          {matter.bylaw.title}
                        </Link>
                        {matter.bylaw.year && (
                          <span className="text-xs text-zinc-500 font-medium block mb-3">
                            Adopted {matter.bylaw.year}
                          </span>
                        )}
                        {matter.bylaw.plain_english_summary && (
                          <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">
                            {matter.bylaw.plain_english_summary}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="px-6 py-3 bg-zinc-950/50 border-t border-zinc-800 flex items-center justify-between">
                  <Link
                    to={`/bylaws/${matter.bylaw.id}`}
                    className="text-xs font-bold text-zinc-400 hover:text-white flex items-center gap-2 transition-colors"
                  >
                    View Full Legislation History
                    <ChevronRight className="h-3 w-3" />
                  </Link>

                  <Dialog>
                    <DialogTrigger asChild>
                      <button className="flex items-center justify-center gap-2 px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-lg text-xs font-bold hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer border border-zinc-700">
                        <FileText className="h-3 w-3" />
                        Quick Read
                      </button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
                      <DialogHeader className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/50">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge
                            variant="outline"
                            className="border-blue-200 text-blue-700 bg-blue-50/50"
                          >
                            {matter.bylaw.bylaw_number
                              ? `Bylaw ${matter.bylaw.bylaw_number}`
                              : "Bylaw"}
                          </Badge>
                          <span className="text-xs text-zinc-400 font-medium">
                            Adopted {matter.bylaw.year}
                          </span>
                        </div>
                        <DialogTitle className="text-xl font-bold text-zinc-900">
                          {matter.bylaw.title}
                        </DialogTitle>
                      </DialogHeader>
                      <ScrollArea className="flex-1 min-h-0">
                        <div className="prose prose-sm max-w-none text-zinc-700 p-6">
                          {matter.bylaw.full_text ? (
                            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-600">
                              {matter.bylaw.full_text}
                            </pre>
                          ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                              <FileText className="h-12 w-12 mb-4 opacity-20" />
                              <p>Full text not available.</p>
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                      <div className="p-4 border-t border-zinc-100 bg-zinc-50 flex justify-end">
                        <a
                          href={`/api/bylaws/${matter.bylaw.id}/download`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          Download Original PDF{" "}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            )}

            <div className="mt-8 flex items-center gap-6 text-sm text-zinc-400">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                First seen: {formatDate(firstSeen || "")}
              </div>
              <Separator orientation="vertical" className="h-4" />
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Last seen: {formatDate(lastSeen || "")}
              </div>
            </div>
          </div>
        </header>

        <div className="space-y-12">
          {matter.locations && matter.locations.length > 0 && (
            <section>
              <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 px-4 mb-4">
                Geographic Scope
              </h2>
              <ClientOnly
                fallback={
                  <div className="h-[600px] w-full bg-zinc-100 rounded-3xl" />
                }
              >
                {() => (
                  <Suspense
                    fallback={
                      <div className="h-[600px] w-full bg-zinc-100 rounded-3xl" />
                    }
                  >
                    <MattersMap matters={[matter]} />
                  </Suspense>
                )}
              </ClientOnly>
            </section>
          )}

          <section>
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 px-4">
              Lifecycle Timeline
            </h2>

            <div className="space-y-4 mt-4">
              {timeline.map((item) => (
                <div
                  key={item.id}
                  className="relative pl-8 before:absolute before:left-0 before:top-4 before:bottom-0 before:w-0.5 before:bg-zinc-200 last:before:hidden"
                >
                  <div className="absolute left-[-4px] top-4 w-2 h-2 rounded-full bg-blue-600 ring-4 ring-zinc-50 z-10" />

                  <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden hover:border-blue-200 transition-all group">
                    <div className="p-6">
                      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-black text-zinc-400 uppercase tracking-widest">
                            {formatDate(item.meetings.meeting_date)}
                          </span>
                          <Badge
                            variant="secondary"
                            className="bg-zinc-100 text-zinc-600 hover:bg-zinc-100 font-medium text-[10px]"
                          >
                            {item.meetings.organizations?.name}
                          </Badge>
                        </div>
                        <Link
                          to={`/meetings/${item.meeting_id}`}
                          className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 group-hover:translate-x-1 transition-transform"
                        >
                          Full Recording
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>

                      <h3 className="text-lg font-bold text-zinc-900 mb-2">
                        {item.title}
                      </h3>
                      {item.plain_english_summary && (
                        <p className="text-sm text-zinc-500 mb-4 font-medium leading-relaxed">
                          {item.plain_english_summary}
                        </p>
                      )}
                      {item.debate_summary && (
                        <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100 mb-4 italic text-sm text-zinc-600 leading-relaxed">
                          "{item.debate_summary}"
                        </div>
                      )}

                      {item.motions && item.motions.length > 0 && (
                        <div className="space-y-4 mt-6 border-t border-zinc-100 pt-6">
                          {item.motions.map((motion: any) => (
                            <MotionCard key={motion.id} motion={motion} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
