import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { ApiEnv } from "../../types";
import type { Context } from "hono";
import { getSupabaseAdminClient } from "~/lib/supabase.server";
import { decodeCursor, extractPage } from "../../lib/cursor";
import { listResponse } from "../../lib/envelope";
import { serializeMatterSummary } from "../../serializers/matter";
import { ApiError } from "../../lib/api-errors";

/**
 * GET /api/v1/:municipality/matters
 *
 * Returns a paginated list of matters with optional filters.
 * Sorted by last_seen DESC (most recently active first).
 */
export class ListMatters extends OpenAPIRoute {
  schema = {
    tags: ["Matters"],
    security: [{ ApiKeyAuth: [] }],
    summary: "List matters",
    description:
      "Returns a paginated list of matters (council business items) with optional filters for status, category, and date range.",
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
        status: z
          .string()
          .optional()
          .describe("Filter by matter status (e.g. Active, Complete)"),
        category: z
          .string()
          .optional()
          .describe("Filter by category"),
        date_from: z
          .string()
          .optional()
          .describe(
            "Filter matters last seen on or after this date (YYYY-MM-DD)",
          ),
        date_to: z
          .string()
          .optional()
          .describe(
            "Filter matters last seen on or before this date (YYYY-MM-DD)",
          ),
      }),
    },
    responses: {
      "200": {
        description: "Paginated list of matters",
      },
    },
  };

  async handle(c: Context<ApiEnv>) {
    const data = await this.getValidatedData<typeof this.schema>();
    const { cursor, per_page, status, category, date_from, date_to } =
      data.query;
    const muni = c.get("municipality")!;
    const supabase = getSupabaseAdminClient();

    let query = supabase
      .from("matters")
      .select(
        "id, slug, title, status, category, description, first_seen, last_seen",
      )
      .eq("municipality_id", muni.id);

    // Apply filters
    if (status) query = query.eq("status", status);
    if (category) query = query.eq("category", category);
    if (date_from) query = query.gte("last_seen", date_from);
    if (date_to) query = query.lte("last_seen", date_to);

    // Apply cursor pagination (keyset on last_seen DESC, id DESC)
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        query = query.or(
          `last_seen.lt.${decoded.v},and(last_seen.eq.${decoded.v},id.lt.${decoded.id})`,
        );
      }
    }

    query = query
      .order("last_seen", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(per_page + 1);

    const { data: rows, error } = await query;
    if (error)
      throw new ApiError(500, "QUERY_ERROR", "Failed to fetch matters");

    const page = extractPage(rows ?? [], per_page, "last_seen");

    return listResponse(c, page.data.map(serializeMatterSummary), {
      has_more: page.has_more,
      next_cursor: page.next_cursor,
      per_page,
    });
  }
}
