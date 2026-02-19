# Phase 7: Document Intelligence - Research

**Researched:** 2026-02-17
**Domain:** PDF document sectioning, embedding, full-text search, pipeline integration
**Confidence:** HIGH

## Summary

Phase 7 adds document sectioning to the existing Python ETL pipeline. PDF documents already ingested into the `documents` table (with `full_text` extracted via PyMuPDF) need to be chunked into sections, stored in a new `document_sections` table with halfvec(384) embeddings and tsvector full-text search, linked to agenda items, and displayed on meeting detail pages via expandable accordions.

The codebase already has all the primitives needed: PyMuPDF text extraction with OCR fallback (`parser.py`), font-based heading detection (`marker_parser.py`), a block parser that detects numbered headers (`parse_minutes_into_blocks()` in `parser.py`), an embedding pipeline using OpenAI text-embedding-3-small at 384 dimensions (`embed.py`), and a precedent chunking table (`bylaw_chunks`). The web app uses `CollapsibleSection` components with grid-row animation for expandable UI. The work is primarily connecting existing capabilities in a new sequence.

Only 7 documents exist in the database across 2 meetings today, but 714 meetings have `archive_path` values pointing to local PDF archives. The backfill strategy must handle both creating document rows (via existing `_ingest_documents()`) and then sectioning them. A two-pass approach (sections first, embeddings second) is specified for resumability.

**Primary recommendation:** Build a `document_chunker.py` module that uses PyMuPDF dict-mode font analysis (from `marker_parser.py`) to detect headings and split documents into sections. Integrate as a post-step in `_ingest_documents()` and add to `embed.py` TABLE_CONFIG for embedding generation.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Section granularity
- Section titles for headingless content: document name + position (e.g. "Staff Report - Section 2 of 4")

#### Backfill strategy
- Both automatic sectioning on new ingest AND a --backfill-sections flag for existing documents
- Parse errors: log and skip, continue with remaining documents
- Idempotency: skip documents that already have sections by default; add --force/--replace flag to delete-and-recreate
- Two-pass approach: create all sections first, then generate embeddings in a separate pass (resumable if embedding fails)

#### Meeting page display
- Sections displayed as expandable accordions under agenda items — section titles visible, click to expand content
- Original PDF link preserved alongside parsed sections (sections are an addition, not a replacement)

### Claude's Discretion
- Chunking approach: heading-driven vs heading + size cap, overlap strategy — pick what works best for RAG quality
- Fallback behavior for headingless PDFs (whole doc as one section vs fixed-size chunks)
- Section accordion placement relative to existing document list
- Exact accordion styling and interaction details

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PyMuPDF (fitz) | >=1.26.7 | PDF text extraction + font/layout analysis | Already in use; `parser.py` and `marker_parser.py` both use it. Dict mode provides font sizes for heading detection |
| OpenAI text-embedding-3-small | API | 384-dimension embeddings for sections | Already standard in `embed.py`; all other tables use halfvec(384) |
| psycopg2-binary | (installed) | Direct DB writes via COPY for bulk embedding updates | Already used by `embed.py` for performant batch writes |
| pgvector | Extension | halfvec(384) cosine similarity search | Already enabled; HNSW indexes on all embedding columns |
| PostgreSQL tsvector | Built-in | Full-text search with GIN indexes | Already used on meetings, agenda_items, motions, transcript_segments |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| marker-pdf | >=1.6.1 | OCR fallback for scanned PDFs | Already in use; called when PyMuPDF extraction returns <100 chars |
| @radix-ui/react-accordion | latest | Accessible accordion component for section display | If the existing `CollapsibleSection` component doesn't fit the multi-item accordion pattern |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PyMuPDF dict-mode heading detection | marker-pdf layout analysis | marker-pdf is heavier (loads ML models); dict-mode font analysis is lighter and sufficient for heading detection in digital-native PDFs |
| Fixed-size chunking | LangChain text splitters | Out of scope per REQUIREMENTS.md; PyMuPDF heading detection is sufficient for this domain |
| HNSW index | IVFFlat index | HNSW is already standard across the codebase; IVFFlat requires tuning `lists` parameter and periodic reindexing |

**Installation (pipeline):**
No new Python dependencies needed. All libraries already installed.

**Installation (web, if needed):**
```bash
pnpm add @radix-ui/react-accordion  # Only if CollapsibleSection doesn't suffice
```

## Architecture Patterns

### Recommended Project Structure

```
apps/pipeline/pipeline/ingestion/
├── ingester.py              # Existing — add _ingest_document_sections() call
├── embed.py                 # Existing — add document_sections to TABLE_CONFIG
└── document_chunker.py      # NEW — heading detection + chunking logic

apps/web/app/
├── services/meetings.ts     # Existing — add document_sections fetch
├── components/meeting/
│   ├── AgendaOverview.tsx    # Existing — add document sections in expanded content
│   └── DocumentSections.tsx  # NEW — accordion display for sections
└── lib/types.ts              # Existing — add DocumentSection interface
```

### Pattern 1: Font-Based Heading Detection (from marker_parser.py)

**What:** Analyze font sizes across the PDF using PyMuPDF dict mode. The most frequent font is body text; anything significantly larger (>1.2x body size) or bold is a heading.

**When to use:** For all digital-native PDFs (which is the vast majority of View Royal council documents).

**Example (adapted from existing `marker_parser.py`):**
```python
# Source: apps/pipeline/pipeline/marker_parser.py analyze_fonts()
import fitz
from collections import Counter

def detect_headings(pdf_path: str) -> list[dict]:
    """Detect headings by font size analysis. Returns list of {title, page, y_pos}."""
    doc = fitz.open(pdf_path)
    font_counts = Counter()
    spans_data = []

    for page_num, page in enumerate(doc):
        blocks = page.get_text("dict")["blocks"]
        for block in blocks:
            if block["type"] != 0:  # Skip image blocks
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    text = span["text"].strip()
                    if not text:
                        continue
                    size = round(span["size"] * 2) / 2
                    font_id = f"{span['font']}_{size}"
                    font_counts[font_id] += len(text)
                    spans_data.append({
                        "text": text,
                        "size": size,
                        "font": span["font"],
                        "flags": span["flags"],  # bit 0=superscript, 1=italic, 4=bold
                        "page": page_num,
                        "y": line["bbox"][1],
                    })

    # Body font = most frequent by character count
    body_font_id = font_counts.most_common(1)[0][0]
    body_size = float(body_font_id.split("_")[-1])

    headings = []
    for span in spans_data:
        is_larger = span["size"] > body_size * 1.2
        is_bold = bool(span["flags"] & (1 << 4))
        is_all_caps = span["text"] == span["text"].upper() and len(span["text"]) > 3
        if is_larger or (is_bold and (is_all_caps or span["size"] >= body_size)):
            headings.append({
                "title": span["text"],
                "page": span["page"],
                "y_pos": span["y"],
            })

    doc.close()
    return headings
```

### Pattern 2: Two-Pass Embedding (from existing embed.py)

**What:** TABLE_CONFIG in `embed.py` defines how each table is embedded. Adding `document_sections` follows the exact same pattern as `bylaw_chunks`.

**When to use:** When adding a new embeddable table.

**Example (from existing `embed.py`):**
```python
# Source: apps/pipeline/pipeline/ingestion/embed.py TABLE_CONFIG
TABLE_CONFIG = {
    # ... existing tables ...
    "document_sections": {
        "select": "id, section_title, section_text",
        "text_fn": lambda r: f"{r[1] or ''}\n{r[2] or ''}".strip(),
    },
}
```

### Pattern 3: tsvector Generated Column (from bootstrap.sql)

**What:** Full-text search columns are defined as `GENERATED ALWAYS AS` stored columns, automatically maintained by PostgreSQL.

**When to use:** For any text column that needs full-text search.

**Example (from existing schema):**
```sql
-- Source: sql/bootstrap.sql (motions table pattern)
text_search tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(section_title, '') || ' ' || coalesce(section_text, ''))
) STORED
```

### Pattern 4: Supabase RPC Match Function (from bootstrap.sql)

**What:** Each embeddable table has a `match_*` function for vector similarity search. Document sections need one too.

**When to use:** For enabling semantic search on the new table.

**Example (adapted from `match_bylaw_chunks`):**
```sql
-- Source: sql/bootstrap.sql match_bylaw_chunks()
CREATE OR REPLACE FUNCTION match_document_sections (
  query_embedding halfvec(384),
  match_threshold float,
  match_count int,
  filter_document_id bigint DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  document_id bigint,
  section_title text,
  section_text text,
  section_order int,
  similarity float
)
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ds.id,
    ds.document_id,
    ds.section_title,
    ds.section_text,
    ds.section_order,
    1 - (ds.embedding <=> query_embedding) AS similarity
  FROM document_sections ds
  WHERE (filter_document_id IS NULL OR ds.document_id = filter_document_id)
    AND 1 - (ds.embedding <=> query_embedding) > match_threshold
  ORDER BY ds.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

### Pattern 5: Grid-Row Accordion Animation (from collapsible-section.tsx)

**What:** The codebase uses CSS `grid-rows-[1fr]` / `grid-rows-[0fr]` for smooth expand/collapse without JavaScript height measurement.

**When to use:** For the document section accordions on meeting detail pages.

**Example (from existing component):**
```tsx
// Source: apps/web/app/components/ui/collapsible-section.tsx
<div className={cn(
  "grid transition-all duration-300 ease-in-out",
  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
)}>
  <div className="overflow-hidden">
    <div className="border-t border-zinc-100">{children}</div>
  </div>
</div>
```

### Anti-Patterns to Avoid

- **Embedding full documents as single vectors:** The existing `documents` table has an `embedding` column that embeds the entire document. This produces low-quality matches because full-document embeddings dilute the signal. Section-level embeddings are the fix.
- **Chunking by fixed character count alone:** Splitting mid-sentence or mid-paragraph destroys context. Heading-based splitting respects document structure. Fixed-size is the FALLBACK, not the default.
- **Loading all sections eagerly on meeting pages:** Sections contain full text. Fetch section text only when expanded, or include all sections but render lazily in the accordion.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF heading detection | Custom regex on raw text | PyMuPDF dict-mode font analysis | Raw text loses font size information; regex can't distinguish headings from body text reliably |
| Embedding generation | Custom API wrapper | Existing `embed.py` + TABLE_CONFIG | Already handles batching, rate limits, error recovery, COPY-based DB writes |
| Expandable UI sections | Custom JS height animation | CSS grid-rows pattern (already in codebase) | Zero-JS animation, no layout thrash, already proven in `collapsible-section.tsx` |
| Full-text search | Custom tokenization | PostgreSQL `tsvector` GENERATED ALWAYS | Handles stemming, stop words, ranking automatically; GIN index is production-grade |
| Text cleaning | New cleanup function | Existing `_clean_extracted_text()` in parser.py | Already handles View Royal's specific Unicode garbage and font encoding issues |

**Key insight:** This phase is primarily integration work. Every primitive (PDF parsing, font analysis, embedding, tsvector, accordion UI) already exists in the codebase. The new code is the chunking logic and the wiring.

## Common Pitfalls

### Pitfall 1: Heading Detection on Scanned/Image PDFs

**What goes wrong:** PyMuPDF dict mode returns no text blocks for scanned PDFs, so font analysis fails.
**Why it happens:** Some older council documents are scanned images, not digital-native PDFs.
**How to avoid:** Already handled: `_ingest_documents()` falls back to OCR (marker-pdf) when PyMuPDF returns <100 chars. For sectioning, when dict-mode returns no usable blocks, fall back to the OCR text and use fixed-size chunking.
**Warning signs:** `full_text` in documents table is populated (via OCR fallback), but font analysis returns empty spans list.

### Pitfall 2: Heading Merging and Multi-Line Titles

**What goes wrong:** PDF headings often span multiple spans or lines. "STAFF REPORT" might be one span, and "RE: Zoning Amendment" the next line. Treating each as a separate heading creates fragmented sections.
**Why it happens:** PyMuPDF returns text at the span level, not the logical heading level.
**How to avoid:** Merge consecutive heading-sized spans on the same or adjacent lines into a single heading. The existing `marker_parser.py` handles this by accumulating header text until it encounters body-sized text.
**Warning signs:** Many sections with very short titles (1-2 words) that should be longer.

### Pitfall 3: Very Large Sections Degrade RAG Quality

**What goes wrong:** A heading followed by 20 pages of body text produces a single section too large for effective embedding.
**Why it happens:** Some documents have few headings but lots of content (e.g., entire staff reports under one heading).
**How to avoid:** Apply a size cap (~2000 tokens / ~8000 chars, matching `MAX_EMBED_CHARS` in embed.py). If a section exceeds the cap, split it at paragraph boundaries. Label sub-sections as "Staff Report - Part 1 of 3".
**Warning signs:** `token_count` values >2000 in the document_sections table.

### Pitfall 4: Agenda Item Linking False Positives

**What goes wrong:** Title matching between document sections and agenda items produces incorrect links due to generic titles.
**Why it happens:** Agenda items like "Correspondence" or "Business Arising" appear in many meetings. Document sections referencing these common titles could link to the wrong meeting's item.
**How to avoid:** Always scope matching to the same meeting (document.meeting_id = agenda_item.meeting_id). Use fuzzy matching with a high threshold for short titles. Prefer matching on section number patterns (e.g., "8.1" in a section matches agenda item with item_order "8.1").
**Warning signs:** Sections linked to agenda items from different meetings, or all sections linked to the same generic agenda item.

### Pitfall 5: Backfill Performance

**What goes wrong:** Processing 714 meetings worth of PDFs takes hours; if it crashes partway through, work is lost.
**Why it happens:** Each PDF requires file I/O, text extraction, font analysis, and DB writes.
**How to avoid:** The two-pass approach (sections first, embeddings second) already addresses embedding resumability. For sectioning, process one meeting at a time and commit each meeting's sections atomically. Skip meetings that already have sections (idempotency). Log progress with meeting counts.
**Warning signs:** Script running for >1 hour without progress output.

### Pitfall 6: Missing Document Rows for Most Meetings

**What goes wrong:** Backfill assumes documents exist in the database, but only 7 documents exist across 2 meetings. Most meetings only have `archive_path` pointing to local PDF files.
**Why it happens:** `_ingest_documents()` was added recently and only runs on newly-ingested meetings.
**How to avoid:** The backfill script must first run document ingestion (creating `documents` rows from archive PDFs), THEN run sectioning on the resulting rows. This is a prerequisite step, not part of sectioning itself.
**Warning signs:** Backfill finds 0 documents to section despite 714 meetings having archive paths.

## Code Examples

### Database Schema for document_sections

```sql
-- Source: Adapted from bylaw_chunks pattern + ARCHITECTURE.md recommendation
CREATE TABLE document_sections (
    id bigint generated by default as identity primary key,
    document_id bigint REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
    agenda_item_id bigint REFERENCES agenda_items(id) ON DELETE SET NULL,
    section_title text,
    section_text text NOT NULL,
    section_order integer NOT NULL,
    page_start integer,
    page_end integer,
    token_count integer,
    embedding halfvec(384),
    text_search tsvector GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(section_title, '') || ' ' || coalesce(section_text, ''))
    ) STORED,
    municipality_id bigint REFERENCES municipalities(id) DEFAULT 1,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX idx_document_sections_document ON document_sections(document_id);
CREATE INDEX idx_document_sections_agenda_item ON document_sections(agenda_item_id);
CREATE INDEX idx_document_sections_search ON document_sections USING gin(text_search);
CREATE INDEX idx_document_sections_embedding ON document_sections
    USING hnsw (embedding halfvec_cosine_ops);
```

### Chunking Logic Skeleton

```python
# Source: Synthesized from marker_parser.py + parser.py patterns
import fitz
from collections import Counter

MAX_SECTION_CHARS = 8000  # Match embed.py MAX_EMBED_CHARS
MIN_SECTION_CHARS = 100   # Skip trivially small sections

def chunk_document(pdf_path: str, doc_title: str) -> list[dict]:
    """
    Chunk a PDF into sections based on heading detection.
    Returns list of {section_title, section_text, section_order, page_start, page_end}.
    """
    doc = fitz.open(pdf_path)

    # Phase 1: Detect body font via frequency analysis
    body_size = _detect_body_font_size(doc)

    if body_size is None:
        # Headingless/image PDF — fall back to fixed-size chunks
        doc.close()
        return _fixed_size_fallback(pdf_path, doc_title)

    # Phase 2: Walk pages, split at headings
    sections = _split_at_headings(doc, body_size)
    doc.close()

    if not sections:
        return _fixed_size_fallback(pdf_path, doc_title)

    # Phase 3: Enforce size cap — split oversized sections at paragraph boundaries
    final_sections = []
    for section in sections:
        if len(section["section_text"]) > MAX_SECTION_CHARS:
            parts = _split_at_paragraphs(section, MAX_SECTION_CHARS)
            final_sections.extend(parts)
        elif len(section["section_text"]) >= MIN_SECTION_CHARS:
            final_sections.append(section)

    # Re-number section_order
    for i, s in enumerate(final_sections):
        s["section_order"] = i + 1

    return final_sections


def _fixed_size_fallback(pdf_path: str, doc_title: str) -> list[dict]:
    """Split headingless documents into fixed-size chunks."""
    from pipeline.parser import get_pdf_text, get_pdf_text_ocr

    text = get_pdf_text(pdf_path)
    if len(text.strip()) < 100:
        text = get_pdf_text_ocr(pdf_path)

    if not text or len(text.strip()) < MIN_SECTION_CHARS:
        return []

    chunks = _split_text_at_paragraphs(text, MAX_SECTION_CHARS)
    total = len(chunks)
    return [
        {
            "section_title": f"{doc_title} - Section {i+1} of {total}",
            "section_text": chunk,
            "section_order": i + 1,
            "page_start": None,
            "page_end": None,
        }
        for i, chunk in enumerate(chunks)
    ]
```

### Embedding Integration

```python
# Source: apps/pipeline/pipeline/ingestion/embed.py — add to TABLE_CONFIG
"document_sections": {
    "select": "id, section_title, section_text",
    "text_fn": lambda r: f"{r[1] or ''}\n{r[2] or ''}".strip(),
},
```

### TypeScript Interface

```typescript
// Source: Adapted from existing types in apps/web/app/lib/types.ts
export interface DocumentSection {
  id: number;
  document_id: number;
  agenda_item_id: number | null;
  section_title: string | null;
  section_text: string;
  section_order: number;
  page_start: number | null;
  page_end: number | null;
  token_count: number | null;
}
```

### Service Layer Query

```typescript
// Source: Adapted from apps/web/app/services/meetings.ts patterns
async function getDocumentSections(
  client: SupabaseClient,
  documentId: number
): Promise<DocumentSection[]> {
  const { data, error } = await client
    .from("document_sections")
    .select("id, document_id, agenda_item_id, section_title, section_text, section_order, page_start, page_end, token_count")
    .eq("document_id", documentId)
    .order("section_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single embedding per document | Section-level embeddings | This phase | Much better RAG retrieval — matches specific sections, not diluted full-doc vectors |
| PDF link only | Parsed sections + PDF link | This phase | Users can read content directly without downloading PDFs |
| No full-text search on documents | tsvector on document_sections | This phase | Keyword search hits specific sections, not whole documents |
| IVFFlat indexes | HNSW indexes | Already migrated | Better recall; no need to tune `lists` parameter. All existing indexes use HNSW |

**Deprecated/outdated:**
- `documents.embedding` column: Will become redundant once `document_sections` embeddings exist. The single full-document embedding provides inferior search quality. Consider dropping it in a future cleanup phase.

## Open Questions

1. **Agenda item linking accuracy**
   - What we know: Documents belong to meetings via `meeting_id`. Agenda items also belong to meetings. Section titles or numbered headers (e.g., "8.1") often correspond to agenda item `item_order` values.
   - What's unclear: How reliable is title/number matching across all 714 meetings? Some agenda items have generic titles ("Correspondence") that may match falsely.
   - Recommendation: Start with number-pattern matching (section header "8.1" -> agenda_item.item_order "8.1" within the same meeting). Fall back to fuzzy title matching. Log unlinked sections for manual review. Accept that not all sections will link — unlinked sections still display under the document, just not under a specific agenda item.

2. **Token counting method**
   - What we know: The `token_count` column is useful for monitoring section quality and enforcing size caps.
   - What's unclear: Whether to use OpenAI's tiktoken for accurate token counts or a simpler word-count heuristic.
   - Recommendation: Use `len(text.split()) * 1.3` as a rough token estimate. Exact tokenization is unnecessary — the count is for monitoring, not billing. `tiktoken` adds a dependency for minimal benefit.

3. **Accordion placement on meeting detail page**
   - What we know: The `AgendaOverview` expanded content area currently shows: summary, description, financial impact, location, debate summary, watch video button, motions, keywords. Document sections need to appear here too.
   - What's unclear: Whether sections should appear per-agenda-item (when linked) or in a separate "Documents" section on the meeting page.
   - Recommendation: Show linked sections within the agenda item expanded area (after motions, before keywords). Show unlinked sections in a new "Documents" collapsible section on the meeting page. This matches the user's decision that "sections are displayed as expandable accordions under agenda items."

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DOC-01 | Pipeline chunks PDF documents into sections using heading-based parsing with fixed-size fallback | Font-based heading detection via PyMuPDF dict mode (Pattern 1). Fixed-size fallback at paragraph boundaries with doc_title + position naming (User Constraint). Size cap at ~8000 chars matching `MAX_EMBED_CHARS`. |
| DOC-02 | Document sections stored in `document_sections` table with per-section halfvec(384) embeddings | Schema follows `bylaw_chunks` precedent. Embedding via existing `embed.py` TABLE_CONFIG addition (Pattern 2). HNSW index matches all other embedding indexes. |
| DOC-03 | Document sections have tsvector full-text search indexes | `GENERATED ALWAYS AS` tsvector column (Pattern 3) with GIN index. Matches existing pattern on meetings, agenda_items, motions, transcript_segments. |
| DOC-04 | Pipeline links document sections to corresponding agenda items via title matching | `agenda_item_id` FK on document_sections. Number-pattern matching (section "8.1" -> item_order "8.1") scoped to same meeting. Fuzzy title fallback. See Open Question 1. |
| DOC-05 | Existing documents backfilled into sections with embeddings | Two-pass approach (User Constraint): create sections first, embed second. Idempotent skip-if-exists + --force flag. Must first ensure document rows exist for all 714 archived meetings (Pitfall 6). --backfill-sections CLI flag. |
</phase_requirements>

## Sources

### Primary (HIGH confidence)
- `apps/pipeline/pipeline/marker_parser.py` — Font-based heading detection via PyMuPDF dict mode, body font identification by frequency analysis
- `apps/pipeline/pipeline/parser.py` — `get_pdf_text()`, `get_pdf_text_ocr()`, `parse_minutes_into_blocks()`, `_clean_extracted_text()`
- `apps/pipeline/pipeline/ingestion/ingester.py` — `_ingest_documents()` method (lines 688-766), `_classify_document()`, document upsert pattern
- `apps/pipeline/pipeline/ingestion/embed.py` — TABLE_CONFIG pattern, OpenAI text-embedding-3-small at 384 dims, MAX_EMBED_CHARS=8000, batch embedding via psycopg2 COPY
- `apps/pipeline/pipeline/orchestrator.py` — `_embed_new_content()` iterates TABLE_CONFIG tables
- `sql/bootstrap.sql` — `bylaw_chunks` table (lines 369-376), `documents` table (lines 383-406), tsvector patterns (lines 187, 223, 276, 317), HNSW indexes (lines 438-445), `match_bylaw_chunks` RPC (lines 622-652)
- `apps/web/app/components/ui/collapsible-section.tsx` — Grid-row accordion animation pattern
- `apps/web/app/components/meeting/AgendaOverview.tsx` — Expanded content layout (summary, motions, keywords sections)
- `apps/web/app/services/meetings.ts` — Supabase query patterns for meeting data
- `apps/web/app/lib/types.ts` — TypeScript interface patterns

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` — Document sectioning architecture plan, integration points, schema recommendation
- Database query results: 7 documents across 2 meetings, 714 meetings with archive_path, 2285 bylaw_chunks averaging ~953 chars

### Tertiary (LOW confidence)
- None — all findings verified against codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All libraries already in use; no new dependencies required for pipeline
- Architecture: HIGH — Follows established patterns (bylaw_chunks, embed.py TABLE_CONFIG, tsvector columns, HNSW indexes)
- Pitfalls: HIGH — Based on analysis of actual codebase data (7 docs, 714 archives, font detection edge cases from marker_parser.py)

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (stable domain — PDF processing and PostgreSQL patterns don't shift fast)
