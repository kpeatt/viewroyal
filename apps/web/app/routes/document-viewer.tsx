import type { Route } from "./+types/document-viewer";
import { getSupabaseAdminClient } from "../lib/supabase.server";
import { Link, useRouteLoaderData } from "react-router";
import type { Municipality, DocumentSection } from "../lib/types";
import { ChevronLeft, FileText, ExternalLink, Hash } from "lucide-react";
import { cn, formatDate } from "../lib/utils";

export const meta: Route.MetaFunction = ({ data }) => {
  if (!data?.document) return [{ title: "Document | ViewRoyal.ai" }];
  const d = data.document as any;
  const title = `${d.title} | ViewRoyal.ai`;
  return [
    { title },
    { name: "description", content: `Parsed document: ${d.title}` },
  ];
};

export async function loader({ params }: Route.LoaderArgs) {
  const { id: meetingId, docId } = params;
  if (!meetingId || !docId)
    throw new Response("Missing params", { status: 400 });

  const supabase = getSupabaseAdminClient();

  // Fetch document
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("id, meeting_id, title, category, source_url, page_count")
    .eq("id", docId)
    .single();

  if (docError || !doc)
    throw new Response("Document Not Found", { status: 404 });

  // Fetch meeting title for breadcrumb
  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, title, meeting_date")
    .eq("id", meetingId)
    .single();

  // Fetch all sections for this document
  const { data: sections } = await supabase
    .from("document_sections")
    .select(
      "id, document_id, agenda_item_id, section_title, section_text, section_order, page_start, page_end, token_count",
    )
    .eq("document_id", docId)
    .order("section_order", { ascending: true });

  // Fetch linked agenda items for cross-referencing
  const linkedAgendaIds = [
    ...new Set(
      (sections || [])
        .map((s: any) => s.agenda_item_id)
        .filter(Boolean),
    ),
  ];

  let agendaItems: Record<number, { id: number; title: string; item_order: string }> = {};
  if (linkedAgendaIds.length > 0) {
    const { data: items } = await supabase
      .from("agenda_items")
      .select("id, title, item_order")
      .in("id", linkedAgendaIds);
    if (items) {
      agendaItems = Object.fromEntries(items.map((i: any) => [i.id, i]));
    }
  }

  return {
    document: doc,
    meeting,
    sections: sections || [],
    agendaItems,
  };
}

export default function DocumentViewer({ loaderData }: Route.ComponentProps) {
  const { document: doc, meeting, sections, agendaItems } = loaderData;
  const rootData = useRouteLoaderData("root") as
    | { municipality?: Municipality }
    | undefined;

  // Build table of contents from sections that have titles
  const tocEntries = (sections as DocumentSection[]).filter(
    (s) => s.section_title && s.section_title !== "CARRIED",
  );

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-4xl px-6 py-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-3">
            <Link
              to={`/meetings/${meeting?.id}`}
              className="flex items-center gap-1 hover:text-zinc-700 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              {meeting?.title}
            </Link>
            <span>/</span>
            <span className="text-zinc-700">Document</span>
          </div>

          {/* Title */}
          <h1 className="text-xl font-semibold text-zinc-900 leading-tight">
            {doc.title}
          </h1>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-zinc-500">
            {meeting?.meeting_date && (
              <span>{formatDate(meeting.meeting_date)}</span>
            )}
            {doc.page_count && (
              <span>{doc.page_count} pages</span>
            )}
            <span>{(sections as any[]).length} sections</span>
            {doc.category && (
              <span className="capitalize">{doc.category}</span>
            )}
            {doc.source_url && (
              <a
                href={doc.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Original PDF
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex gap-8">
          {/* Table of Contents — sidebar */}
          {tocEntries.length > 5 && (
            <nav className="hidden lg:block w-56 shrink-0">
              <div className="sticky top-8">
                <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
                  Contents
                </h2>
                <ul className="space-y-1 text-sm max-h-[calc(100vh-6rem)] overflow-y-auto">
                  {tocEntries.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#section-${s.section_order}`}
                        className="block py-1 text-zinc-500 hover:text-zinc-900 truncate transition-colors"
                        title={s.section_title || undefined}
                      >
                        {s.section_title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </nav>
          )}

          {/* Document body */}
          <div className="flex-1 min-w-0">
            {(sections as DocumentSection[]).map((section, idx) => {
              const linkedItem = section.agenda_item_id
                ? (agendaItems as any)[section.agenda_item_id]
                : null;

              return (
                <div
                  key={section.id}
                  id={`section-${section.section_order}`}
                  className={cn(
                    "relative",
                    idx > 0 && "mt-6",
                  )}
                >
                  {/* Section heading */}
                  {section.section_title && (
                    <h2 className="text-base font-semibold text-zinc-900 mb-2 font-serif">
                      {section.section_title}
                    </h2>
                  )}

                  {/* Linked agenda item badge */}
                  {linkedItem && (
                    <Link
                      to={`/meetings/${meeting?.id}#agenda-${linkedItem.id}`}
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 bg-indigo-50 rounded px-2 py-0.5 mb-2 transition-colors"
                    >
                      <Hash className="w-3 h-3" />
                      {linkedItem.item_order} {linkedItem.title}
                    </Link>
                  )}

                  {/* Section text */}
                  <div className="text-sm text-zinc-700 leading-relaxed whitespace-pre-line font-serif">
                    {section.section_text}
                  </div>

                  {/* Page indicator */}
                  {section.page_start != null && (
                    <div className="mt-1 text-[10px] text-zinc-400">
                      Page {section.page_start}
                      {section.page_end &&
                      section.page_end !== section.page_start
                        ? `–${section.page_end}`
                        : ""}
                    </div>
                  )}

                  {/* Divider between sections */}
                  {idx < (sections as any[]).length - 1 && (
                    <hr className="mt-6 border-zinc-100" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
