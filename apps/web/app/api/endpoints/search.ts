import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { ApiEnv } from "../types";
import type { Context } from "hono";
import { getSupabaseAdminClient } from "~/lib/supabase.server";
import { listResponse } from "../lib/envelope";
import { serializeSearchResult } from "../serializers/search";
import { ApiError } from "../lib/api-errors";

/**
 * Valid content types for the search endpoint.
 * Plural form in the query param, singular form in the response.
 */
const VALID_TYPES = [
  "motions",
  "matters",
  "agenda_items",
  "key_statements",
  "document_sections",
] as const;
type ContentTypePlural = (typeof VALID_TYPES)[number];

/** Map plural query param values to singular type labels for responses. */
const TYPE_SINGULAR: Record<ContentTypePlural, string> = {
  motions: "motion",
  matters: "matter",
  agenda_items: "agenda_item",
  key_statements: "key_statement",
  document_sections: "document_section",
};

/**
 * Compute a position-based relevance score for FTS results.
 *
 * PostgREST returns `.textSearch()` results ordered by tsvector relevance,
 * so position in the result set is a meaningful proxy for ts_rank_cd.
 * This uses the same approach as the existing `ftsSearchTranscriptSegments`
 * in hybrid-search.server.ts: scale from a baseline down across the result set.
 *
 * Score range: 0.10 (most relevant) down to ~0.01 (least relevant).
 */
function positionScore(index: number, total: number): number {
  if (total <= 1) return 0.1;
  return 0.1 - (index / total) * 0.09;
}

/**
 * GET /api/v1/:municipality/search
 *
 * Cross-entity keyword search using Postgres tsvector full-text search.
 * Searches across motions, matters, agenda_items, key_statements, and
 * document_sections.  Results are merged, ranked by relevance score,
 * and paginated using page-based offset.
 *
 * Keyword search (tsvector) is available to all API key holders.
 * Hybrid/semantic search is out of scope for this endpoint.
 */
export class SearchEndpoint extends OpenAPIRoute {
  schema = {
    summary: "Search across all content types",
    description:
      "Full-text keyword search across motions, matters, agenda items, key statements, and document sections. Returns results ranked by relevance with type, score, and text snippets.",
    request: {
      query: z.object({
        q: z
          .string()
          .min(1)
          .describe("Search query text"),
        type: z
          .string()
          .optional()
          .describe(
            "Comma-separated content type filter. Valid: motions, matters, agenda_items, key_statements, document_sections",
          ),
        per_page: z.coerce
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Number of results per page (max 100)"),
        page: z.coerce
          .number()
          .int()
          .min(1)
          .default(1)
          .describe("Page number (1-based)"),
      }),
    },
    responses: {
      "200": {
        description: "Paginated search results ranked by relevance",
      },
    },
  };

  async handle(c: Context<ApiEnv>) {
    const data = await this.getValidatedData<typeof this.schema>();
    const { q, type, per_page, page } = data.query;
    const muni = c.get("municipality")!;
    const supabase = getSupabaseAdminClient();

    // Determine which content types to search
    let typesToSearch: ContentTypePlural[] = [...VALID_TYPES];
    if (type) {
      const requested = type.split(",").map((t) => t.trim());
      const valid = requested.filter((t): t is ContentTypePlural =>
        VALID_TYPES.includes(t as ContentTypePlural),
      );
      if (valid.length === 0) {
        throw new ApiError(
          400,
          "INVALID_TYPE",
          `Invalid type filter. Valid types: ${VALID_TYPES.join(", ")}`,
        );
      }
      typesToSearch = valid;
    }

    // Fetch more from each type to have enough after merge + sort
    const perTypeLimit = per_page * 2;

    // Run parallel keyword searches across selected content types
    interface RawResult {
      row: any;
      type: string;
      score: number;
      meetingInfo: { slug: string | null; date: string | null };
    }

    const promises: Promise<RawResult[]>[] = [];

    const shouldSearch = (t: ContentTypePlural) => typesToSearch.includes(t);

    if (shouldSearch("motions")) {
      promises.push(
        searchMotions(supabase, q, muni.id, perTypeLimit),
      );
    }

    if (shouldSearch("matters")) {
      promises.push(
        searchMatters(supabase, q, muni.id, perTypeLimit),
      );
    }

    if (shouldSearch("agenda_items")) {
      promises.push(
        searchAgendaItems(supabase, q, muni.id, perTypeLimit),
      );
    }

    if (shouldSearch("key_statements")) {
      promises.push(
        searchKeyStatements(supabase, q, muni.id, perTypeLimit),
      );
    }

    if (shouldSearch("document_sections")) {
      promises.push(
        searchDocumentSections(supabase, q, muni.id, perTypeLimit),
      );
    }

    const resultSets = await Promise.all(promises);

    // Merge all results and sort by score descending
    const merged = resultSets.flat().sort((a, b) => b.score - a.score);

    // Apply page-based offset pagination
    const start = (page - 1) * per_page;
    const pageResults = merged.slice(start, start + per_page);
    const has_more = merged.length > start + per_page;

    // Serialize results
    const serialized = pageResults.map((r) =>
      serializeSearchResult(r.row, r.type, r.score, r.meetingInfo),
    );

    return listResponse(c, serialized, {
      has_more,
      next_cursor: null,
      per_page,
      page,
    });
  }
}

// ---------------------------------------------------------------------------
// Per-type search functions
// ---------------------------------------------------------------------------

interface RawResult {
  row: any;
  type: string;
  score: number;
  meetingInfo: { slug: string | null; date: string | null };
}

async function searchMotions(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  q: string,
  municipalityId: string,
  limit: number,
): Promise<RawResult[]> {
  const { data, error } = await supabase
    .from("motions")
    .select(
      "id, slug, text_content, plain_english_summary, meetings!inner(slug, meeting_date, municipality_id)",
    )
    .textSearch("text_search", q, { type: "websearch" })
    .eq("meetings.municipality_id", municipalityId)
    .limit(limit);

  if (error) {
    console.error("Search motions error:", error);
    return [];
  }

  return (data ?? []).map((row: any, i: number) => {
    const meeting = Array.isArray(row.meetings)
      ? row.meetings[0]
      : row.meetings;
    return {
      row,
      type: "motion",
      score: positionScore(i, data.length),
      meetingInfo: {
        slug: meeting?.slug ?? null,
        date: meeting?.meeting_date ?? null,
      },
    };
  });
}

async function searchMatters(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  q: string,
  municipalityId: string,
  limit: number,
): Promise<RawResult[]> {
  const { data, error } = await supabase
    .from("matters")
    .select(
      "id, slug, title, description, plain_english_summary",
    )
    .textSearch("text_search", q, { type: "websearch" })
    .eq("municipality_id", municipalityId)
    .limit(limit);

  if (error) {
    console.error("Search matters error:", error);
    return [];
  }

  return (data ?? []).map((row: any, i: number) => ({
    row,
    type: "matter",
    score: positionScore(i, data.length),
    meetingInfo: { slug: null, date: null },
  }));
}

async function searchAgendaItems(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  q: string,
  municipalityId: string,
  limit: number,
): Promise<RawResult[]> {
  const { data, error } = await supabase
    .from("agenda_items")
    .select(
      "id, slug, title, plain_english_summary, debate_summary, meetings!inner(slug, meeting_date, municipality_id)",
    )
    .textSearch("text_search", q, { type: "websearch" })
    .eq("meetings.municipality_id", municipalityId)
    .limit(limit);

  if (error) {
    console.error("Search agenda_items error:", error);
    return [];
  }

  return (data ?? []).map((row: any, i: number) => {
    const meeting = Array.isArray(row.meetings)
      ? row.meetings[0]
      : row.meetings;
    return {
      row,
      type: "agenda_item",
      score: positionScore(i, data.length),
      meetingInfo: {
        slug: meeting?.slug ?? null,
        date: meeting?.meeting_date ?? null,
      },
    };
  });
}

async function searchKeyStatements(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  q: string,
  municipalityId: string,
  limit: number,
): Promise<RawResult[]> {
  // key_statements link to meetings via meeting_id (direct FK)
  const { data, error } = await supabase
    .from("key_statements")
    .select(
      "id, statement_text, context, speaker_name, meetings!inner(slug, meeting_date, municipality_id)",
    )
    .textSearch("text_search", q, { type: "websearch" })
    .eq("meetings.municipality_id", municipalityId)
    .limit(limit);

  if (error) {
    console.error("Search key_statements error:", error);
    return [];
  }

  return (data ?? []).map((row: any, i: number) => {
    const meeting = Array.isArray(row.meetings)
      ? row.meetings[0]
      : row.meetings;
    return {
      row,
      type: "key_statement",
      score: positionScore(i, data.length),
      meetingInfo: {
        slug: meeting?.slug ?? null,
        date: meeting?.meeting_date ?? null,
      },
    };
  });
}

async function searchDocumentSections(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  q: string,
  municipalityId: string,
  limit: number,
): Promise<RawResult[]> {
  // document_sections -> extracted_documents -> meetings
  const { data, error } = await supabase
    .from("document_sections")
    .select(
      "id, section_title, section_text, extracted_documents!inner(meetings!inner(slug, meeting_date, municipality_id))",
    )
    .textSearch("text_search", q, { type: "websearch" })
    .eq(
      "extracted_documents.meetings.municipality_id",
      municipalityId,
    )
    .limit(limit);

  if (error) {
    // Graceful: document_sections may be empty (Phase 7.1 backfill pending)
    console.error("Search document_sections error:", error);
    return [];
  }

  return (data ?? []).map((row: any, i: number) => {
    const doc = Array.isArray(row.extracted_documents)
      ? row.extracted_documents[0]
      : row.extracted_documents;
    const meeting = doc?.meetings
      ? Array.isArray(doc.meetings)
        ? doc.meetings[0]
        : doc.meetings
      : null;
    return {
      row,
      type: "document_section",
      score: positionScore(i, data.length),
      meetingInfo: {
        slug: meeting?.slug ?? null,
        date: meeting?.meeting_date ?? null,
      },
    };
  });
}
