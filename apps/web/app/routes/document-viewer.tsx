import type { Route } from "./+types/document-viewer";
import { getSupabaseAdminClient } from "../lib/supabase.server";
import { Link } from "react-router";
import type {
  DocumentSection,
  DocumentImage,
  ExtractedDocument,
} from "../lib/types";
import {
  ChevronLeft,
  ExternalLink,
  Hash,
  Lightbulb,
  BookOpen,
  FileText,
  Images,
} from "lucide-react";
import { cn, formatDate } from "../lib/utils";
import { MarkdownContent } from "../components/markdown-content";
import {
  getDocumentTypeLabel,
  getDocumentTypeColor,
} from "../lib/document-types";
import { ogImageUrl } from "../lib/og";

export const meta: Route.MetaFunction = ({ data }) => {
  if (!data?.extractedDoc)
    return [{ title: "Document | ViewRoyal.ai" }];
  const ed = data.extractedDoc as ExtractedDocument;
  const description = ed.summary || `Document: ${ed.title}`;
  return [
    { title: `${ed.title} | ViewRoyal.ai` },
    { name: "description", content: description },
    { property: "og:title", content: ed.title },
    { property: "og:description", content: description },
    { property: "og:type", content: "article" },
    { property: "og:image", content: ogImageUrl(ed.title, { type: "default" }) },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
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
  const [sectionsRes, parentDocRes, agendaItemRes, imagesRes] =
    await Promise.all([
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
      supabase
        .from("document_images")
        .select(
          "id, extracted_document_id, document_section_id, r2_key, page, description, image_type, width, height, format, file_size",
        )
        .eq("extracted_document_id", docId)
        .order("page", { ascending: true })
        .order("id", { ascending: true }),
    ]);

  return {
    extractedDoc,
    meeting: meetingRes.data,
    sections: sectionsRes.data || [],
    parentDocument: parentDocRes.data,
    linkedAgendaItem: agendaItemRes.data,
    documentImages: (imagesRes.data || []) as DocumentImage[],
  };
}

export default function DocumentViewer({ loaderData }: Route.ComponentProps) {
  const {
    extractedDoc,
    meeting,
    sections,
    parentDocument,
    linkedAgendaItem,
    documentImages,
  } = loaderData;

  const ed = extractedDoc as ExtractedDocument;
  const allSections = sections as DocumentSection[];
  const keyFacts = ed.key_facts || [];

  // Group images by section ID for inline placement
  const imagesBySection = new Map<number, DocumentImage[]>();
  const unlinkedImages: DocumentImage[] = [];
  for (const img of documentImages) {
    if (img.document_section_id != null) {
      const existing = imagesBySection.get(img.document_section_id) || [];
      existing.push(img);
      imagesBySection.set(img.document_section_id, existing);
    } else {
      unlinkedImages.push(img);
    }
  }

  /**
   * Replace [Image: ...] tags in markdown with actual <img> HTML,
   * consuming linked images in order. Unmatched tags are stripped.
   */
  function inlineImages(markdown: string, images: DocumentImage[]): string {
    let imgIdx = 0;
    return markdown.replace(/\[Image:\s*[^\]]+\]/g, (match) => {
      if (imgIdx >= images.length) return ""; // strip unmatched tags
      const img = images[imgIdx++];
      const src = `https://images.viewroyal.ai/${img.r2_key}`;
      const alt = img.description
        ? img.description.replace(/"/g, "&quot;")
        : "Document image";
      const widthAttr = img.width ? ` width="${img.width}"` : "";
      const heightAttr = img.height ? ` height="${img.height}"` : "";
      return (
        `<figure class="my-4 max-w-2xl">` +
        `<a href="${src}" target="_blank" rel="noopener noreferrer">` +
        `<img src="${src}" alt="${alt}"${widthAttr}${heightAttr} loading="lazy" ` +
        `class="rounded-lg border border-zinc-200 bg-zinc-50 w-full h-auto object-contain hover:shadow-md transition-shadow" />` +
        `</a>` +
        (img.description
          ? `<figcaption class="mt-1 text-xs text-zinc-500">${img.description}</figcaption>`
          : "") +
        `</figure>`
      );
    });
  }

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

        {/* Section content with inline images */}
        {allSections.length > 0 ? (
          <div>
            {allSections.map((section, idx) => {
              const sectionImages = imagesBySection.get(section.id) || [];
              const content =
                sectionImages.length > 0
                  ? inlineImages(section.section_text, sectionImages)
                  : section.section_text;
              return (
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

                  <MarkdownContent content={content} />

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
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-zinc-500 py-12 text-center">
            No sections available for this document.
          </p>
        )}

        {/* Unlinked images gallery (images without section FK) */}
        {unlinkedImages.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center gap-2 mb-4">
              <Images className="w-4 h-4 text-zinc-400" />
              <h2 className="text-sm font-semibold text-zinc-700">
                Document Images
              </h2>
              <span className="text-xs text-zinc-400">
                ({unlinkedImages.length})
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {unlinkedImages.map((img) => (
                <a
                  key={img.id}
                  href={`https://images.viewroyal.ai/${img.r2_key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block"
                >
                  <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 transition-shadow group-hover:shadow-md">
                    <img
                      src={`https://images.viewroyal.ai/${img.r2_key}`}
                      alt={img.description || "Document image"}
                      loading="lazy"
                      width={img.width ?? undefined}
                      height={img.height ?? undefined}
                      className="w-full h-auto object-contain"
                    />
                  </div>
                  {img.description && (
                    <p className="mt-1 text-xs text-zinc-500 leading-snug line-clamp-2">
                      {img.description}
                    </p>
                  )}
                </a>
              ))}
            </div>
          </div>
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
