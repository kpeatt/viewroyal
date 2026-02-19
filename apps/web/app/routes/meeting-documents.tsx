import type { Route } from "./+types/meeting-documents";
import { getSupabaseAdminClient } from "../lib/supabase.server";
import { getExtractedDocumentsForMeeting } from "../services/meetings";
import { Link } from "react-router";
import type { ExtractedDocument } from "../lib/types";
import {
  ChevronLeft,
  FileText,
  ExternalLink,
  BookOpen,
  ChevronRight,
} from "lucide-react";
import { cn, formatDate } from "../lib/utils";
import {
  getDocumentTypeLabel,
  getDocumentTypeColor,
} from "../lib/document-types";
import { ogImageUrl, ogUrl } from "../lib/og";

export const meta: Route.MetaFunction = ({ data }) => {
  if (!data?.meeting) return [{ title: "Documents | ViewRoyal.ai" }];
  const m = data.meeting as any;
  const description = `All documents for ${m.title} on ${m.meeting_date}`;
  return [
    { title: `Documents — ${m.title} | ViewRoyal.ai` },
    { name: "description", content: description },
    { property: "og:title", content: `Documents — ${m.title}` },
    { property: "og:description", content: description },
    { property: "og:type", content: "article" },
    { property: "og:url", content: ogUrl(`/meetings/${m.id}/documents`) },
    { property: "og:image", content: ogImageUrl(`Documents — ${m.title}`, { type: "meeting" }) },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
  ];
};

export async function loader({ params }: Route.LoaderArgs) {
  const { id: meetingId } = params;
  if (!meetingId) throw new Response("Missing params", { status: 400 });

  const supabase = getSupabaseAdminClient();

  const [meetingRes, docsRes, extractedDocs] = await Promise.all([
    supabase
      .from("meetings")
      .select("id, title, meeting_date, type")
      .eq("id", meetingId)
      .single(),
    supabase
      .from("documents")
      .select("id, title, category, source_url, page_count")
      .eq("meeting_id", meetingId)
      .order("title"),
    getExtractedDocumentsForMeeting(supabase, meetingId),
  ]);

  if (meetingRes.error || !meetingRes.data)
    throw new Response("Meeting Not Found", { status: 404 });

  return {
    meeting: meetingRes.data,
    documents: docsRes.data || [],
    extractedDocuments: extractedDocs,
  };
}

export default function MeetingDocuments({ loaderData }: Route.ComponentProps) {
  const { meeting, documents, extractedDocuments } = loaderData;
  const extractedDocs = extractedDocuments as ExtractedDocument[];

  // Group extracted docs by parent document_id
  const byDocument = new Map<number, ExtractedDocument[]>();
  for (const ed of extractedDocs) {
    const existing = byDocument.get(ed.document_id);
    if (existing) {
      existing.push(ed);
    } else {
      byDocument.set(ed.document_id, [ed]);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-3">
            <Link
              to={`/meetings/${meeting.id}`}
              className="flex items-center gap-1 hover:text-zinc-700 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              {meeting.title}
            </Link>
            <span>/</span>
            <span className="text-zinc-700">Documents</span>
          </div>

          <h1 className="text-xl font-semibold text-zinc-900 leading-tight">
            Meeting Documents
          </h1>

          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-zinc-500">
            {meeting.meeting_date && (
              <span>{formatDate(meeting.meeting_date)}</span>
            )}
            <span>
              {documents.length} PDF{documents.length !== 1 ? "s" : ""}
            </span>
            {extractedDocs.length > 0 && (
              <span>{extractedDocs.length} documents extracted</span>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8">
        {documents.length === 0 ? (
          <p className="text-sm text-zinc-500 py-12 text-center">
            No documents available for this meeting.
          </p>
        ) : (
          <div className="space-y-8">
            {(documents as any[]).map((doc) => {
              const docExtracted = byDocument.get(doc.id) || [];
              return (
                <div key={doc.id}>
                  {/* PDF header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-zinc-400" />
                      <h2 className="text-sm font-semibold text-zinc-900">
                        {doc.title}
                      </h2>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-400">
                      {doc.page_count && <span>{doc.page_count} pages</span>}
                      {doc.source_url && (
                        <a
                          href={doc.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 hover:text-zinc-600 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          PDF
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Extracted documents list */}
                  {docExtracted.length > 0 ? (
                    <div className="space-y-2">
                      {docExtracted.map((ed) => (
                        <Link
                          key={ed.id}
                          to={`/meetings/${meeting.id}/documents/${ed.id}`}
                          className="group block rounded-lg border border-zinc-200 hover:border-zinc-300 hover:shadow-sm px-4 py-3 transition-all"
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={cn(
                                "inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase rounded border shrink-0 mt-0.5",
                                getDocumentTypeColor(ed.document_type),
                              )}
                            >
                              {getDocumentTypeLabel(ed.document_type)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-medium text-zinc-900 group-hover:text-indigo-700 transition-colors leading-snug">
                                {ed.title}
                              </h3>
                              {ed.summary && (
                                <p className="text-xs text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
                                  {ed.summary}
                                </p>
                              )}
                              <div className="flex items-center gap-3 mt-1.5 text-[11px] text-zinc-400">
                                {ed.page_start != null && (
                                  <span>
                                    {ed.page_end &&
                                    ed.page_end !== ed.page_start
                                      ? `Pages ${ed.page_start}\u2013${ed.page_end}`
                                      : `Page ${ed.page_start}`}
                                  </span>
                                )}
                                {ed.key_facts && ed.key_facts.length > 0 && (
                                  <span>
                                    {ed.key_facts.length} key fact
                                    {ed.key_facts.length !== 1 ? "s" : ""}
                                  </span>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 shrink-0 mt-1 transition-colors" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400 ml-6">
                      No extracted content available
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
