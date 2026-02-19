import type { Route } from "./+types/bylaw-detail";
import { getBylawById } from "../services/bylaws";
import { getSupabaseAdminClient } from "../lib/supabase.server";
import { Link, useRouteLoaderData } from "react-router";
import type { Municipality } from "../lib/types";
import { ogImageUrl, ogUrl } from "../lib/og";

export const meta: Route.MetaFunction = ({ data }) => {
  if (!data?.bylaw) return [{ title: "Bylaw | ViewRoyal.ai" }];
  const b = data.bylaw as any;
  const label = b.bylaw_number ? `Bylaw ${b.bylaw_number}` : b.title;
  const title = `${label} | ViewRoyal.ai`;
  const description = b.plain_english_summary || `${b.title} — ${b.status || "Active"}`;
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: label },
    { property: "og:description", content: description },
    { property: "og:type", content: "article" },
    { property: "og:url", content: ogUrl(`/bylaws/${b.id}`) },
    { property: "og:image", content: ogImageUrl(label, { subtitle: b.status, type: "bylaw" }) },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
  ];
};
import {
  ChevronLeft,
  Book,
  FileText,
  Calendar,
  ExternalLink,
  List,
  Info,
  Download,
  History,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import { cn, formatDate } from "../lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export async function loader({ params }: Route.LoaderArgs) {
  const { id } = params;
  if (!id) throw new Response("ID Required", { status: 400 });

  try {
    const supabase = getSupabaseAdminClient();
    const bylaw = await getBylawById(supabase, id);
    if (!bylaw) throw new Response("Bylaw Not Found", { status: 404 });
    return { bylaw };
  } catch (error) {
    console.error(error);
    throw new Response("Bylaw Not Found", { status: 404 });
  }
}

export default function BylawDetail({ loaderData }: Route.ComponentProps) {
  const { bylaw } = loaderData;
  const rootData = useRouteLoaderData("root") as { municipality?: Municipality } | undefined;
  const municipalityName = rootData?.municipality?.name || "Town of View Royal";

  // Construct legislative timeline from linked matters and agenda items
  const meetingEvents = (bylaw.matters || []).flatMap((matter) =>
    (matter.agenda_items || []).map((item) => {
      const isAdoption =
        item.title.toLowerCase().includes("adoption") ||
        item.title.toLowerCase().includes("adopted");

      return {
        id: `item-${item.id}`,
        date: item.meetings?.meeting_date,
        meetingTitle: item.meetings?.title,
        meetingId: item.meeting_id,
        orgName: item.meetings?.organization?.name,
        title: item.title,
        matterTitle: matter.title,
        type: isAdoption ? "adoption" : "meeting",
      };
    }),
  );

  const milestoneEvents = bylaw.year
    ? [
        {
          id: "adoption-event",
          date: `${bylaw.year}-01-01`,
          meetingTitle: `Adopted ${bylaw.year}`,
          meetingId: 0,
          orgName: municipalityName,
          title: `Official adoption year of Bylaw No. ${bylaw.bylaw_number || ""}`,
          matterTitle: bylaw.title,
          type: "milestone",
        },
      ]
    : [];

  const timeline = [...meetingEvents, ...milestoneEvents]
    .filter((item) => item.date)
    .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="container mx-auto py-8 px-4 max-w-5xl">
        <Link
          to="/bylaws"
          className="group flex items-center text-sm font-medium text-zinc-600 hover:text-blue-600 mb-6 transition-colors"
        >
          <ChevronLeft className="mr-1 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          Back to Bylaws
        </Link>

        <header className="mb-8 bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Book className="h-32 w-32" />
          </div>

          <div className="relative">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {bylaw.bylaw_number ? (
                <Badge className="bg-zinc-900 text-white font-mono font-bold px-3 py-1 text-xs">
                  No. {bylaw.bylaw_number}
                </Badge>
              ) : (
                <Badge className="bg-zinc-900 text-white font-bold px-3 py-1 text-xs">
                  Policy
                </Badge>
              )}
              {bylaw.category && (
                <Badge
                  variant="outline"
                  className="border-blue-200 text-blue-700 bg-blue-50/50 px-3 py-1"
                >
                  {bylaw.category}
                </Badge>
              )}
              {bylaw.status && bylaw.status !== "Active" && (
                <span className="text-[10px] uppercase font-black tracking-widest text-red-500 bg-red-50 px-2 py-0.5 rounded">
                  {bylaw.status}
                </span>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-zinc-900 mb-4 leading-tight">
              {bylaw.title}
            </h1>

            <div className="flex flex-wrap items-center gap-6 text-sm text-zinc-500 mt-6">
              {bylaw.year && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-zinc-400" />
                  <span className="font-medium">Adopted {bylaw.year}</span>
                </div>
              )}
              <Separator orientation="vertical" className="h-4" />
              <a
                href={`/api/bylaws/${bylaw.id}/download`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium transition-colors"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </a>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* AI Summary */}
            {bylaw.plain_english_summary && (
              <section className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
                <div className="bg-blue-50/50 px-6 py-4 border-b border-blue-100 flex items-center gap-2">
                  <Info className="h-4 w-4 text-blue-600" />
                  <h2 className="text-sm font-bold text-blue-900 uppercase tracking-wider">
                    Plain English Summary
                  </h2>
                </div>
                <div className="p-6">
                  <p className="text-base text-zinc-700 leading-relaxed">
                    {bylaw.plain_english_summary}
                  </p>
                </div>
              </section>
            )}

            {/* Legislative Timeline */}
            {timeline.length > 0 && (
              <section className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
                <div className="bg-zinc-50 px-6 py-4 border-b border-zinc-200 flex items-center gap-2">
                  <History className="h-4 w-4 text-zinc-500" />
                  <h2 className="text-sm font-bold text-zinc-700 uppercase tracking-wider">
                    Legislative Timeline
                  </h2>
                </div>
                <div className="p-6">
                  <div className="relative border-l border-zinc-200 ml-3 space-y-8 my-2">
                    {timeline.map((event) => (
                      <div key={event.id} className="relative pl-8">
                        <div
                          className={cn(
                            "absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white shadow-sm ring-1 ring-zinc-200",
                            event.type === "milestone"
                              ? "bg-zinc-900"
                              : event.type === "adoption"
                                ? "bg-green-600"
                                : "bg-blue-600",
                          )}
                        />
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-zinc-900">
                              {event.type === "milestone"
                                ? event.date?.split("-")[0]
                                : formatDate(event.date!)}
                            </span>
                            <Badge
                              variant="secondary"
                              className={cn(
                                "text-[10px] h-5",
                                event.type === "adoption"
                                  ? "bg-green-100 text-green-700 hover:bg-green-100"
                                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-100",
                              )}
                            >
                              {event.orgName}
                            </Badge>
                          </div>
                        </div>
                        {event.type === "milestone" ? (
                          <h4 className="text-sm font-bold text-zinc-900 mb-1">
                            {event.meetingTitle}
                          </h4>
                        ) : (
                          <Link
                            to={`/meetings/${event.meetingId}`}
                            className="group block mb-1"
                          >
                            <h4
                              className={cn(
                                "text-sm font-bold transition-colors flex items-center gap-1",
                                event.type === "adoption"
                                  ? "text-green-700 hover:text-green-800"
                                  : "text-blue-600 hover:text-blue-800",
                              )}
                            >
                              {event.meetingTitle}
                              <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </h4>
                          </Link>
                        )}
                        <p className="text-sm text-zinc-600 leading-relaxed">
                          {event.title}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Outline */}
            {bylaw.outline && (
              <section className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
                <div className="bg-zinc-50 px-6 py-4 border-b border-zinc-200 flex items-center gap-2">
                  <List className="h-4 w-4 text-zinc-500" />
                  <h2 className="text-sm font-bold text-zinc-700 uppercase tracking-wider">
                    Document Outline
                  </h2>
                </div>
                <div className="p-6 bg-white">
                  <div className="prose prose-sm prose-zinc max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {bylaw.outline}
                    </ReactMarkdown>
                  </div>
                </div>
              </section>
            )}

            {/* Full Text Preview */}
            <section className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
              <div className="bg-zinc-50 px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-zinc-500" />
                  <h2 className="text-sm font-bold text-zinc-700 uppercase tracking-wider">
                    Full Text
                  </h2>
                </div>
              </div>
              <div className="p-0">
                <div className="max-h-[600px] overflow-y-auto p-6 bg-zinc-50/30">
                  <pre className="whitespace-pre-wrap font-mono text-xs text-zinc-600 leading-relaxed">
                    {bylaw.full_text || "Text not available."}
                  </pre>
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-6">
            {/* Sidebar Info */}
            <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-900 mb-4 uppercase tracking-wider">
                Document Details
              </h3>
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-zinc-500 mb-1">Status</dt>
                  <dd className="font-medium text-zinc-900">{bylaw.status}</dd>
                </div>
                {bylaw.year && (
                  <div>
                    <dt className="text-zinc-500 mb-1">Year</dt>
                    <dd className="font-medium text-zinc-900">{bylaw.year}</dd>
                  </div>
                )}
                {bylaw.category && (
                  <div>
                    <dt className="text-zinc-500 mb-1">Category</dt>
                    <dd className="font-medium text-zinc-900">
                      {bylaw.category}
                    </dd>
                  </div>
                )}
              </dl>

              <Separator className="my-6" />

              <a
                href={`/api/bylaws/${bylaw.id}/download`}
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-bold hover:bg-zinc-800 transition-colors"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
