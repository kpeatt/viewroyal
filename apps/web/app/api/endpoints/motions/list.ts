import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { ApiEnv } from "../../types";
import type { Context } from "hono";
import { getSupabaseAdminClient } from "~/lib/supabase.server";
import { decodeCursor, extractPage } from "../../lib/cursor";
import { listResponse } from "../../lib/envelope";
import { serializeMotionSummary } from "../../serializers/motion";
import { ApiError } from "../../lib/api-errors";

/**
 * GET /api/v1/:municipality/motions
 *
 * Returns a paginated list of motions with optional filters.
 * Motions are scoped to the municipality via an inner join on meetings.
 * Sorted by id DESC (most recent first).
 */
export class ListMotions extends OpenAPIRoute {
  schema = {
    tags: ["Motions"],
    security: [{ ApiKeyAuth: [] }],
    summary: "List motions",
    description:
      "Returns a paginated list of motions (council votes/decisions) with optional filters for result, meeting, and mover.",
    request: {
      query: z.object({
        cursor: z
          .string()
          .optional()
          .describe("Pagination cursor from previous response"),
        per_page: z.coerce
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Number of results per page (max 100)"),
        result: z
          .string()
          .optional()
          .describe('Filter by vote result (e.g. "Carried", "Defeated")'),
        meeting: z
          .string()
          .optional()
          .describe("Filter by meeting slug"),
        mover: z
          .string()
          .optional()
          .describe("Filter by mover person slug"),
      }),
    },
    responses: {
      "200": {
        description: "Paginated list of motions",
      },
    },
  };

  async handle(c: Context<ApiEnv>) {
    const data = await this.getValidatedData<typeof this.schema>();
    const { cursor, per_page, result, meeting, mover } = data.query;
    const muni = c.get("municipality")!;
    const supabase = getSupabaseAdminClient();

    // Motions don't have municipality_id -- scope via inner join on meetings
    let query = supabase
      .from("motions")
      .select(
        "id, slug, text_content, plain_english_summary, result, mover_id, seconder_id, meetings!inner(slug, meeting_date, municipality_id), mover_person:people!motions_mover_id_fkey(name), seconder_person:people!motions_seconder_id_fkey(name)",
      )
      .eq("meetings.municipality_id", muni.id);

    // Apply filters
    if (result) query = query.eq("result", result);
    if (meeting) query = query.eq("meetings.slug", meeting);
    if (mover) {
      // For mover filter, we need to filter by the mover person's slug
      // First look up the person by slug
      const { data: person } = await supabase
        .from("people")
        .select("id")
        .eq("slug", mover)
        .maybeSingle();
      if (person) {
        query = query.eq("mover_id", person.id);
      } else {
        // No person found -- return empty results
        return listResponse(c, [], {
          has_more: false,
          next_cursor: null,
          per_page,
        });
      }
    }

    // Apply cursor pagination (keyset on id DESC)
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        query = query.lt("id", decoded.id);
      }
    }

    query = query
      .order("id", { ascending: false })
      .limit(per_page + 1);

    const { data: rows, error } = await query;
    if (error)
      throw new ApiError(500, "QUERY_ERROR", "Failed to fetch motions");

    const page = extractPage(rows ?? [], per_page, "id");

    return listResponse(c, page.data.map(serializeMotionSummary), {
      has_more: page.has_more,
      next_cursor: page.next_cursor,
      per_page,
    });
  }
}
