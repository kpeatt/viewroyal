import type { Route } from "./+types/document-viewer";
import { getSupabaseAdminClient } from "../lib/supabase.server";
import { Link } from "react-router";
import type { DocumentSection, ExtractedDocument } from "../lib/types";
import {
  ChevronLeft,
  ExternalLink,
  Hash,
  Lightbulb,
  BookOpen,
  FileText,
} from "lucide-react";
import { cn, formatDate } from "../lib/utils";
import { MarkdownContent } from "../components/markdown-content";
import {
  getDocumentTypeLabel,
  getDocumentTypeColor,
} from "../lib/document-types";

export const meta: Route.MetaFunction = ({ data }) => {
  if (!data?.extractedDoc)
    return [{ title: "Document | ViewRoyal.ai" }];
  const ed = data.extractedDoc as ExtractedDocument;
  return [
    { title: `${ed.title} | ViewRoyal.ai` },
    {
      name: "description",
      content: ed.summary || `Document: ${ed.title}`,
    },
  ];
};

export async function loader({ params }: Route.LoaderArgs) {
  const { id: meetingId, docId } = params;
  if (!meetingId || !docId)
    throw new Response("Missing params", { status: 400 });

  const supabase = getSupabaseAdminClient();

  // docId is now an extracted_documents.id
  const [edRes, meetingRes] = await Promise.all([
    supabase
      .from("extracted_documents")
      .select(
        "id, document_id, agenda_item_id, title, document_type, page_start, page_end, summary, key_facts, created_at",
      )
      .eq("id", docId)
      .single(),
    supabase
      .from("meetings")
      .select("id, title, meeting_date")
      .eq("id", meetingId)
      .single(),
  ]);

  if (edRes.error || !edRes.data)
    throw new Response("Document Not Found", { status: 404 });

  const extractedDoc = edRes.data as ExtractedDocument;

  // Fetch sections and parent document info in parallel
  const [sectionsRes, parentDocRes, agendaItemRes] = await Promise.all([
    supabase
      .from("document_sections")
      .select(
        "id, document_id, agenda_item_id, extracted_document_id, section_title, section_text, section_order, page_start, page_end, token_count",
      )
      .eq("extracted_document_id", docId)
      .order("section_order", { ascending: true }),
    supabase
      .from("documents")
      .select("id, title, source_url, page_count")
      .eq("id", extractedDoc.document_id)
      .single(),
    extractedDoc.agenda_item_id
      ? supabase
          .from("agenda_items")
          .select("id, title, item_order")
          .eq("id", extractedDoc.agenda_item_id)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  return {
    extractedDoc,
    meeting: meetingRes.data,
    sections: sectionsRes.data || [],
    parentDocument: parentDocRes.data,
    linkedAgendaItem: agendaItemRes.data,
  };
}

export default function DocumentViewer({ loaderData }: Route.ComponentProps) {
  const { extractedDoc, meeting, sections, parentDocument, linkedAgendaItem } =
    loaderData;

  const ed = extractedDoc as ExtractedDocument;
  const allSections = sections as DocumentSection[];
  const keyFacts = ed.key_facts || [];

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-3">
            <Link
              to={`/meetings/${meeting?.id}`}
              className="flex items-center gap-1 hover:text-zinc-700 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              {meeting?.title}
            </Link>
            <span>/</span>
            <Link
              to={`/meetings/${meeting?.id}/documents`}
              className="hover:text-zinc-700 transition-colors"
            >
              Documents
            </Link>
            <span>/</span>
            <span className="text-zinc-700 truncate max-w-[200px]">
              {ed.title}
            </span>
          </div>

          <div className="flex items-start gap-3">
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase rounded border shrink-0 mt-1",
                getDocumentTypeColor(ed.document_type),
              )}
            >
              {getDocumentTypeLabel(ed.document_type)}
            </span>
            <h1 className="text-xl font-semibold text-zinc-900 leading-tight">
              {ed.title}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-zinc-500">
            {meeting?.meeting_date && (
              <span>{formatDate(meeting.meeting_date)}</span>
            )}
            {ed.page_start != null && (
              <span>
                {ed.page_end && ed.page_end !== ed.page_start
                  ? `Pages ${ed.page_start}\u2013${ed.page_end}`
                  : `Page ${ed.page_start}`}
              </span>
            )}
            <span>
              {allSections.length} section
              {allSections.length !== 1 ? "s" : ""}
            </span>
            {(parentDocument as any)?.source_url && (
              <a
                href={(parentDocument as any).source_url}
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
        {/* Summary + key facts + linked agenda item */}
        {(ed.summary || keyFacts.length > 0 || linkedAgendaItem) && (
          <div className="mb-8 space-y-4">
            {ed.summary && (
              <div className="flex items-start gap-2.5">
                <BookOpen className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                <p className="text-sm text-zinc-600 leading-relaxed">
                  {ed.summary}
                </p>
              </div>
            )}

            {linkedAgendaItem && meeting && (
              <Link
                to={`/meetings/${meeting.id}#agenda-${(linkedAgendaItem as any).id}`}
                className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 bg-indigo-50 rounded-md px-2.5 py-1 transition-colors"
              >
                <Hash className="w-3 h-3" />
                {(linkedAgendaItem as any).item_order}{" "}
                {(linkedAgendaItem as any).title}
              </Link>
            )}

            {keyFacts.length > 0 && (
              <div className="flex items-start gap-2.5">
                <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex flex-wrap gap-1.5">
                  {keyFacts.map((fact, i) => (
                    <span
                      key={i}
                      className="text-xs text-zinc-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5"
                    >
                      {fact}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Section content */}
        {allSections.length > 0 ? (
          <div>
            {allSections.map((section, idx) => (
              <div
                key={section.id}
                id={`section-${section.section_order}`}
                className={cn("relative", idx > 0 && "mt-6")}
              >
                {section.section_title && (
                  <h2 className="text-base font-semibold text-zinc-900 mb-2 font-serif">
                    {section.section_title}
                  </h2>
                )}

                <MarkdownContent content={section.section_text} />

                {section.page_start != null && (
                  <div className="mt-1 text-[10px] text-zinc-400">
                    Page {section.page_start}
                    {section.page_end &&
                    section.page_end !== section.page_start
                      ? `\u2013${section.page_end}`
                      : ""}
                  </div>
                )}

                {idx < allSections.length - 1 && (
                  <hr className="mt-6 border-zinc-100" />
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500 py-12 text-center">
            No sections available for this document.
          </p>
        )}

        {/* Source document footer */}
        {parentDocument && (
          <div className="mt-12 pt-6 border-t border-zinc-100">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <FileText className="w-3.5 h-3.5" />
              <span>
                Extracted from: {(parentDocument as any).title}
              </span>
              {(parentDocument as any).page_count && (
                <span>({(parentDocument as any).page_count} pages total)</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
