import { useState } from "react";
import type { Route } from "./+types/document-viewer";
import { getSupabaseAdminClient } from "../lib/supabase.server";
import { getExtractedDocumentsForDocument } from "../services/meetings";
import { Link, useRouteLoaderData } from "react-router";
import type {
  Municipality,
  DocumentSection,
  ExtractedDocument,
} from "../lib/types";
import {
  ChevronLeft,
  ChevronDown,
  ExternalLink,
  Hash,
  Lightbulb,
  BookOpen,
} from "lucide-react";
import { cn, formatDate } from "../lib/utils";
import { MarkdownContent } from "../components/markdown-content";
import {
  getDocumentTypeLabel,
  getDocumentTypeColor,
} from "../lib/document-types";

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

  const [docRes, meetingRes, sectionsRes, extractedDocs] = await Promise.all([
    supabase
      .from("documents")
      .select("id, meeting_id, title, category, source_url, page_count")
      .eq("id", docId)
      .single(),
    supabase
      .from("meetings")
      .select("id, title, meeting_date")
      .eq("id", meetingId)
      .single(),
    supabase
      .from("document_sections")
      .select(
        "id, document_id, agenda_item_id, extracted_document_id, section_title, section_text, section_order, page_start, page_end, token_count",
      )
      .eq("document_id", docId)
      .order("section_order", { ascending: true }),
    getExtractedDocumentsForDocument(supabase, docId),
  ]);

  if (docRes.error || !docRes.data)
    throw new Response("Document Not Found", { status: 404 });

  const sections = sectionsRes.data || [];

  // Collect all referenced agenda item IDs
  const allAgendaIds = new Set<number>();
  sections.forEach((s: any) => {
    if (s.agenda_item_id) allAgendaIds.add(s.agenda_item_id);
  });
  extractedDocs.forEach((ed) => {
    if (ed.agenda_item_id) allAgendaIds.add(ed.agenda_item_id);
  });

  let agendaItems: Record<
    number,
    { id: number; title: string; item_order: string }
  > = {};
  if (allAgendaIds.size > 0) {
    const { data: items } = await supabase
      .from("agenda_items")
      .select("id, title, item_order")
      .in("id", Array.from(allAgendaIds));
    if (items) {
      agendaItems = Object.fromEntries(items.map((i: any) => [i.id, i]));
    }
  }

  return {
    document: docRes.data,
    meeting: meetingRes.data,
    sections,
    extractedDocuments: extractedDocs,
    agendaItems,
  };
}

export default function DocumentViewer({ loaderData }: Route.ComponentProps) {
  const { document: doc, meeting, sections, extractedDocuments, agendaItems } =
    loaderData;
  const rootData = useRouteLoaderData("root") as
    | { municipality?: Municipality }
    | undefined;

  const allSections = sections as DocumentSection[];
  const extractedDocs = extractedDocuments as ExtractedDocument[];
  const hasExtractedDocs = extractedDocs.length > 0;

  // All extracted docs start collapsed
  const [expandedDocId, setExpandedDocId] = useState<number | null>(null);

  // Group sections by extracted_document_id
  const sectionsByExtractedDoc = new Map<number, DocumentSection[]>();
  const orphanSections: DocumentSection[] = [];

  if (hasExtractedDocs) {
    for (const section of allSections) {
      if (section.extracted_document_id) {
        const existing = sectionsByExtractedDoc.get(
          section.extracted_document_id,
        );
        if (existing) {
          existing.push(section);
        } else {
          sectionsByExtractedDoc.set(section.extracted_document_id, [section]);
        }
      } else {
        orphanSections.push(section);
      }
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-5xl px-6 py-4">
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

          <h1 className="text-xl font-semibold text-zinc-900 leading-tight">
            {doc.title}
          </h1>

          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-zinc-500">
            {meeting?.meeting_date && (
              <span>{formatDate(meeting.meeting_date)}</span>
            )}
            {doc.page_count && <span>{doc.page_count} pages</span>}
            {hasExtractedDocs ? (
              <span>{extractedDocs.length} documents extracted</span>
            ) : (
              <span>{allSections.length} sections</span>
            )}
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

      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex gap-8">
          {/* Table of Contents — sidebar */}
          {hasExtractedDocs ? (
            <nav className="hidden lg:block w-60 shrink-0">
              <div className="sticky top-8">
                <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
                  Documents ({extractedDocs.length})
                </h2>
                <ul className="space-y-1.5 text-sm max-h-[calc(100vh-6rem)] overflow-y-auto">
                  {extractedDocs.map((ed) => (
                    <li key={ed.id}>
                      <button
                        onClick={() =>
                          setExpandedDocId(
                            expandedDocId === ed.id ? null : ed.id,
                          )
                        }
                        className={cn(
                          "group flex items-start gap-2 py-1.5 text-left w-full transition-colors",
                          expandedDocId === ed.id
                            ? "text-zinc-900"
                            : "text-zinc-500 hover:text-zinc-900",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase rounded border shrink-0 mt-0.5",
                            getDocumentTypeColor(ed.document_type),
                          )}
                        >
                          {getDocumentTypeLabel(ed.document_type).slice(0, 6)}
                        </span>
                        <span
                          className="truncate leading-snug"
                          title={ed.title}
                        >
                          {ed.title}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </nav>
          ) : (
            allSections.filter(
              (s) => s.section_title && s.section_title !== "CARRIED",
            ).length > 5 && (
              <nav className="hidden lg:block w-56 shrink-0">
                <div className="sticky top-8">
                  <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
                    Contents
                  </h2>
                  <ul className="space-y-1 text-sm max-h-[calc(100vh-6rem)] overflow-y-auto">
                    {allSections
                      .filter(
                        (s) =>
                          s.section_title && s.section_title !== "CARRIED",
                      )
                      .map((s) => (
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
            )
          )}

          {/* Document body */}
          <div className="flex-1 min-w-0">
            {hasExtractedDocs ? (
              <div className="space-y-3">
                {extractedDocs.map((ed) => {
                  const childSections =
                    sectionsByExtractedDoc.get(ed.id) || [];
                  const linkedItem = ed.agenda_item_id
                    ? (agendaItems as any)[ed.agenda_item_id]
                    : null;
                  const isExpanded = expandedDocId === ed.id;

                  return (
                    <ExtractedDocumentCard
                      key={ed.id}
                      extractedDoc={ed}
                      sections={childSections}
                      linkedItem={linkedItem}
                      meetingId={meeting?.id}
                      agendaItems={agendaItems}
                      isExpanded={isExpanded}
                      onToggle={() =>
                        setExpandedDocId(isExpanded ? null : ed.id)
                      }
                    />
                  );
                })}

                {orphanSections.length > 0 && (
                  <div className="mt-10">
                    <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">
                      Additional Sections
                    </h2>
                    {orphanSections.map((section, idx) => (
                      <FlatSection
                        key={section.id}
                        section={section}
                        linkedItem={
                          section.agenda_item_id
                            ? (agendaItems as any)[section.agenda_item_id]
                            : null
                        }
                        meetingId={meeting?.id}
                        isLast={idx === orphanSections.length - 1}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              allSections.map((section, idx) => (
                <FlatSection
                  key={section.id}
                  section={section}
                  linkedItem={
                    section.agenda_item_id
                      ? (agendaItems as any)[section.agenda_item_id]
                      : null
                  }
                  meetingId={meeting?.id}
                  isLast={idx === allSections.length - 1}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExtractedDocumentCard({
  extractedDoc,
  sections,
  linkedItem,
  meetingId,
  agendaItems,
  isExpanded,
  onToggle,
}: {
  extractedDoc: ExtractedDocument;
  sections: DocumentSection[];
  linkedItem: { id: number; title: string; item_order: string } | null;
  meetingId: number | undefined;
  agendaItems: Record<
    number,
    { id: number; title: string; item_order: string }
  >;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const keyFacts = extractedDoc.key_facts || [];

  return (
    <div
      id={`extracted-${extractedDoc.id}`}
      className={cn(
        "rounded-xl border overflow-hidden scroll-mt-8 transition-colors",
        isExpanded ? "border-zinc-300 shadow-sm" : "border-zinc-200",
      )}
    >
      {/* Clickable header — always visible */}
      <button
        onClick={onToggle}
        className="w-full text-left bg-zinc-50 px-5 py-4 hover:bg-zinc-100/80 transition-colors"
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase rounded border shrink-0 mt-0.5",
              getDocumentTypeColor(extractedDoc.document_type),
            )}
          >
            {getDocumentTypeLabel(extractedDoc.document_type)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-zinc-900 leading-snug">
              {extractedDoc.title}
            </h2>
            <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-zinc-500">
              {extractedDoc.page_start != null && (
                <span>
                  Pages {extractedDoc.page_start}
                  {extractedDoc.page_end &&
                  extractedDoc.page_end !== extractedDoc.page_start
                    ? `\u2013${extractedDoc.page_end}`
                    : ""}
                </span>
              )}
              {sections.length > 0 && (
                <span>{sections.length} sections</span>
              )}
            </div>
          </div>
          <ChevronDown
            className={cn(
              "w-5 h-5 text-zinc-400 shrink-0 mt-0.5 transition-transform",
              isExpanded && "rotate-180",
            )}
          />
        </div>

        {/* Summary — always visible as preview */}
        {extractedDoc.summary && (
          <div className="mt-2 flex items-start gap-2 ml-0">
            <BookOpen className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
            <p
              className={cn(
                "text-sm text-zinc-600 leading-relaxed",
                !isExpanded && "line-clamp-2",
              )}
            >
              {extractedDoc.summary}
            </p>
          </div>
        )}
      </button>

      {/* Expandable content */}
      <div
        className={cn(
          "grid transition-all duration-200 ease-in-out",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-zinc-200">
            {/* Linked agenda item + key facts */}
            {(linkedItem || keyFacts.length > 0) && (
              <div className="px-5 py-3 bg-zinc-50/50 space-y-2">
                {linkedItem && meetingId && (
                  <Link
                    to={`/meetings/${meetingId}#agenda-${linkedItem.id}`}
                    className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 bg-indigo-50 rounded px-2 py-0.5 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Hash className="w-3 h-3" />
                    {linkedItem.item_order} {linkedItem.title}
                  </Link>
                )}

                {keyFacts.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-1" />
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

            {/* Sections body */}
            {sections.length > 0 && (
              <div className="px-5 py-4">
                {sections.map((section, idx) => {
                  const sectionLinkedItem = section.agenda_item_id
                    ? agendaItems[section.agenda_item_id]
                    : null;

                  return (
                    <div
                      key={section.id}
                      id={`section-${section.section_order}`}
                      className={cn("relative", idx > 0 && "mt-5")}
                    >
                      {section.section_title && (
                        <h3 className="text-sm font-semibold text-zinc-800 mb-1.5 font-serif">
                          {section.section_title}
                        </h3>
                      )}

                      {sectionLinkedItem &&
                        sectionLinkedItem.id !== linkedItem?.id &&
                        meetingId && (
                          <Link
                            to={`/meetings/${meetingId}#agenda-${sectionLinkedItem.id}`}
                            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 bg-indigo-50 rounded px-2 py-0.5 mb-1.5 transition-colors"
                          >
                            <Hash className="w-3 h-3" />
                            {sectionLinkedItem.item_order}{" "}
                            {sectionLinkedItem.title}
                          </Link>
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

                      {idx < sections.length - 1 && (
                        <hr className="mt-5 border-zinc-100" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FlatSection({
  section,
  linkedItem,
  meetingId,
  isLast,
}: {
  section: DocumentSection;
  linkedItem: { id: number; title: string; item_order: string } | null;
  meetingId: number | undefined;
  isLast: boolean;
}) {
  return (
    <div
      id={`section-${section.section_order}`}
      className={cn("relative", "mb-6")}
    >
      {section.section_title && (
        <h2 className="text-base font-semibold text-zinc-900 mb-2 font-serif">
          {section.section_title}
        </h2>
      )}

      {linkedItem && meetingId && (
        <Link
          to={`/meetings/${meetingId}#agenda-${linkedItem.id}`}
          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 bg-indigo-50 rounded px-2 py-0.5 mb-2 transition-colors"
        >
          <Hash className="w-3 h-3" />
          {linkedItem.item_order} {linkedItem.title}
        </Link>
      )}

      <MarkdownContent content={section.section_text} />

      {section.page_start != null && (
        <div className="mt-1 text-[10px] text-zinc-400">
          Page {section.page_start}
          {section.page_end && section.page_end !== section.page_start
            ? `\u2013${section.page_end}`
            : ""}
        </div>
      )}

      {!isLast && <hr className="mt-6 border-zinc-100" />}
    </div>
  );
}
