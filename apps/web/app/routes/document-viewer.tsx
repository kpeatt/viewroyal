import { useEffect } from "react";
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
import { DocumentTOC, type TOCItem } from "../components/document/DocumentTOC";
import { useScrollSpy } from "../lib/use-scroll-spy";
import {
  detectCrossReferences,
  type CrossReference,
} from "../lib/cross-references";
import { CrossRefBadge } from "../components/document/CrossRefBadge";
import { RelatedDocuments } from "../components/document/RelatedDocuments";

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

  // Fetch sections, parent document, and bylaws (for cross-ref matching) in parallel
  const [sectionsRes, parentDocRes, agendaItemRes, imagesRes, bylawsRes] =
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
      supabase
        .from("bylaws")
        .select("id, title, bylaw_number")
        .not("bylaw_number", "is", null),
    ]);

  // Detect bylaw cross-references in section text
  const crossReferences = detectCrossReferences(
    (sectionsRes.data || []).map((s) => ({
      section_text: s.section_text,
      section_order: s.section_order,
    })),
    (bylawsRes.data || []).map((b) => ({
      id: b.id,
      title: b.title,
      bylaw_number: b.bylaw_number,
    })),
  );

  return {
    extractedDoc,
    meeting: meetingRes.data,
    sections: sectionsRes.data || [],
    parentDocument: parentDocRes.data,
    linkedAgendaItem: agendaItemRes.data,
    documentImages: (imagesRes.data || []) as DocumentImage[],
    crossReferences,
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
    crossReferences,
  } = loaderData;

  const ed = extractedDoc as ExtractedDocument;
  const allSections = sections as DocumentSection[];
  const keyFacts = ed.key_facts || [];

  // Build TOC data from sections
  const tocItems: TOCItem[] = allSections.map((s) => ({
    id: `section-${s.section_order}`,
    title: s.section_title ?? `Section ${s.section_order}`,
    order: s.section_order,
  }));
  const showTOC = tocItems.length >= 3;
  const sectionIds = tocItems.map((t) => t.id);
  const activeId = useScrollSpy(sectionIds);

  // Minimum area to consider an image "substantial" (filters logos/artifacts)
  const MIN_IMAGE_AREA = 80_000; // ~283x283
  // Junk [Image:] tag patterns — strip these tags without consuming an image
  const JUNK_TAG_RE =
    /\b(logo|signature|letterhead|header|footer|crest|coat of arms|watermark|handwritten|stamp|seal|branding)\b/i;

  // Sort all images by (page, id) for consistent ordering
  const sortedImages = [...documentImages].sort(
    (a, b) => a.page - b.page || a.id - b.id,
  );

  // Phase 1: Group images by their database-assigned document_section_id.
  // This is the primary mapping — the pipeline already knows which section
  // each image belongs to. Apply substantial image filter to DB-mapped images.
  const imagesBySection = new Map<number, DocumentImage[]>();
  const sectionById = new Map(allSections.map((s) => [s.id, s]));

  for (const img of sortedImages) {
    if (img.document_section_id != null && sectionById.has(img.document_section_id)) {
      const area = (img.width ?? 0) * (img.height ?? 0);
      if (area >= MIN_IMAGE_AREA) {
        const existing = imagesBySection.get(img.document_section_id) || [];
        existing.push(img);
        imagesBySection.set(img.document_section_id, existing);
      }
    }
  }

  // Phase 2: Fallback — images without document_section_id use positional
  // consumption against [Image:] tags, but only for sections that have no
  // DB-mapped images (avoids double-assigning).
  const unmappedImages = sortedImages.filter(
    (img) =>
      img.document_section_id == null &&
      (img.width ?? 0) * (img.height ?? 0) >= MIN_IMAGE_AREA,
  );

  let fallbackCursor = 0;
  for (const section of allSections) {
    if (imagesBySection.has(section.id)) continue;

    const tags = section.section_text.match(/\[Image(?:\s+\d+)?:\s*[^\]]+\]/g) || [];
    const sectionImgs: DocumentImage[] = [];
    for (const tag of tags) {
      const desc = tag.replace(/^\[Image(?:\s+\d+)?:\s*/, "").replace(/\]$/, "");
      if (JUNK_TAG_RE.test(desc)) continue; // skip junk tags
      if (fallbackCursor < unmappedImages.length) {
        sectionImgs.push(unmappedImages[fallbackCursor++]);
      }
    }
    if (sectionImgs.length > 0) {
      imagesBySection.set(section.id, sectionImgs);
    }
  }

  // Images not consumed by inline matching go to gallery
  const usedIds = new Set<number>();
  for (const imgs of imagesBySection.values()) {
    for (const img of imgs) usedIds.add(img.id);
  }
  const galleryImages = sortedImages.filter((img) => !usedIds.has(img.id));

  /**
   * Replace [Image: ...] tags in markdown with actual <img> HTML,
   * consuming images in order. Junk tags are stripped without consuming.
   * Unmatched tags (more tags than images) are also stripped.
   */
  function inlineImages(
    markdown: string,
    images: DocumentImage[],
  ): string {
    let imgIdx = 0;
    return markdown.replace(/\[Image(?:\s+\d+)?:\s*([^\]]+)\]/g, (_match, desc) => {
      if (JUNK_TAG_RE.test(desc)) return ""; // strip junk tags
      if (imgIdx >= images.length) return ""; // strip unmatched tags

      const img = images[imgIdx++];
      const alt = desc.replace(/"/g, "&quot;");
      const src = `https://images.viewroyal.ai/${img.r2_key}`;
      const widthAttr = img.width ? ` width="${img.width}"` : "";
      const heightAttr = img.height ? ` height="${img.height}"` : "";
      return (
        `<figure class="my-4 max-w-2xl">` +
        `<a href="${src}" target="_blank" rel="noopener noreferrer">` +
        `<img src="${src}" alt="${alt}"${widthAttr}${heightAttr} loading="lazy" ` +
        `class="rounded-lg border border-zinc-200 bg-zinc-50 w-full h-auto object-contain hover:shadow-md transition-shadow" />` +
        `</a>` +
        `<figcaption class="mt-1 text-xs text-zinc-500">${desc}</figcaption>` +
        `</figure>`
      );
    });
  }

  // Toggle table scroll fade indicators based on overflow
  useEffect(() => {
    const containers = document.querySelectorAll('.table-scroll-container');
    if (containers.length === 0) return;

    const check = () => {
      containers.forEach((el) => {
        el.classList.toggle('has-overflow', el.scrollWidth > el.clientWidth);
      });
    };

    // Check on scroll (user may scroll to reveal all content)
    const onScroll = (e: Event) => {
      const el = e.target as HTMLElement;
      el.classList.toggle('has-overflow', el.scrollLeft + el.clientWidth < el.scrollWidth);
    };

    const observer = new ResizeObserver(check);
    containers.forEach((el) => {
      observer.observe(el);
      el.addEventListener('scroll', onScroll);
    });

    return () => {
      observer.disconnect();
      containers.forEach((el) => el.removeEventListener('scroll', onScroll));
    };
  }, [sections]);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-zinc-50">
        <div className={cn("mx-auto px-6 py-4", showTOC ? "max-w-6xl" : "max-w-4xl")}>
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

      {/* Mobile TOC bar - shown below lg breakpoint */}
      {showTOC && (
        <div className="lg:hidden">
          <DocumentTOC items={tocItems} activeId={activeId} variant="mobile" />
        </div>
      )}

      {/* Content area - two column on desktop when TOC shown */}
      {showTOC ? (
        <div className="mx-auto max-w-6xl px-6 py-8 lg:flex lg:gap-8">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            <DocumentContent
              ed={ed}
              keyFacts={keyFacts}
              linkedAgendaItem={linkedAgendaItem}
              meeting={meeting}
              allSections={allSections}
              imagesBySection={imagesBySection}
              inlineImages={inlineImages}
              galleryImages={galleryImages}
              parentDocument={parentDocument}
              crossReferences={crossReferences}
            />
          </div>
          {/* Desktop TOC sidebar - right side */}
          <div className="hidden lg:block w-[220px] shrink-0">
            <div className="sticky top-24 max-h-[calc(100vh-6rem)]">
              <DocumentTOC items={tocItems} activeId={activeId} variant="desktop" />
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-4xl px-6 py-8">
          <DocumentContent
            ed={ed}
            keyFacts={keyFacts}
            linkedAgendaItem={linkedAgendaItem}
            meeting={meeting}
            allSections={allSections}
            imagesBySection={imagesBySection}
            inlineImages={inlineImages}
            galleryImages={galleryImages}
            parentDocument={parentDocument}
            crossReferences={crossReferences}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Shared document content (summary, sections, gallery, footer).
 * Extracted to avoid duplicating JSX in the two-column vs single-column branches.
 */
function DocumentContent({
  ed,
  keyFacts,
  linkedAgendaItem,
  meeting,
  allSections,
  imagesBySection,
  inlineImages,
  galleryImages,
  parentDocument,
  crossReferences,
}: {
  ed: ExtractedDocument;
  keyFacts: string[];
  linkedAgendaItem: any;
  meeting: any;
  allSections: DocumentSection[];
  imagesBySection: Map<number, DocumentImage[]>;
  inlineImages: (markdown: string, images: DocumentImage[]) => string;
  galleryImages: DocumentImage[];
  parentDocument: any;
  crossReferences: CrossReference[];
}) {
  return (
    <>
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
              to={`/meetings/${meeting.id}#agenda-${linkedAgendaItem.id}`}
              className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 bg-indigo-50 rounded-md px-2.5 py-1 transition-colors"
            >
              <Hash className="w-3 h-3" />
              {linkedAgendaItem.item_order} {linkedAgendaItem.title}
            </Link>
          )}

          {keyFacts.length > 0 && (
            <div className="flex items-start gap-2.5">
              <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex flex-wrap gap-1.5">
                {keyFacts.map((fact: string, i: number) => (
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
            const hasImageTags = /\[Image(?:\s+\d+)?:\s*[^\]]+\]/.test(
              section.section_text,
            );
            const content = hasImageTags
              ? inlineImages(section.section_text, sectionImages)
              : section.section_text;
            const sectionCrossRefs = crossReferences.filter((ref) =>
              ref.sectionOrders.includes(section.section_order),
            );
            return (
              <div
                key={section.id}
                id={`section-${section.section_order}`}
                className={cn("relative scroll-mt-20", idx > 0 && "mt-2")}
              >
                <MarkdownContent content={content} />

                {sectionCrossRefs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {sectionCrossRefs.map((ref) => (
                      <CrossRefBadge
                        key={ref.targetId}
                        pattern={ref.pattern}
                        url={ref.targetUrl}
                        title={ref.targetTitle}
                      />
                    ))}
                  </div>
                )}

                {section.page_start != null && (
                  <div className="mt-1 text-[10px] text-zinc-400">
                    Page {section.page_start}
                    {section.page_end &&
                    section.page_end !== section.page_start
                      ? `\u2013${section.page_end}`
                      : ""}
                  </div>
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

      {/* Gallery: images not consumed by inline matching */}
      {galleryImages.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <Images className="w-4 h-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-700">
              Document Images
            </h2>
            <span className="text-xs text-zinc-400">
              ({galleryImages.length})
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {galleryImages.map((img) => (
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

      {/* Related Documents: cross-referenced bylaws */}
      {crossReferences.length > 0 && (
        <RelatedDocuments crossReferences={crossReferences} />
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
    </>
  );
}
