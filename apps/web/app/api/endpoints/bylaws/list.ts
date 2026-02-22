import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { ApiEnv } from "../../types";
import type { Context } from "hono";
import { getSupabaseAdminClient } from "~/lib/supabase.server";
import { decodeCursor, extractPage } from "../../lib/cursor";
import { listResponse } from "../../lib/envelope";
import { serializeBylawSummary } from "../../serializers/bylaw";
import { ApiError } from "../../lib/api-errors";

/**
 * GET /api/v1/:municipality/bylaws
 *
 * Returns a paginated list of bylaws with optional filters.
 * Sorted by id DESC (most recent first).
 */
export class ListBylaws extends OpenAPIRoute {
  schema = {
    tags: ["Bylaws"],
    security: [{ ApiKeyAuth: [] }],
    summary: "List bylaws",
    description:
      "Returns a paginated list of bylaws with optional filters for status, category, and year.",
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
          .describe("Filter by bylaw status"),
        category: z
          .string()
          .optional()
          .describe("Filter by category"),
        year: z.coerce
          .number()
          .int()
          .optional()
          .describe("Filter by bylaw year"),
      }),
    },
    responses: {
      "200": {
        description: "Paginated list of bylaws",
      },
    },
  };

  async handle(c: Context<ApiEnv>) {
    const data = await this.getValidatedData<typeof this.schema>();
    const { cursor, per_page, status, category, year } = data.query;
    const muni = c.get("municipality")!;
    const supabase = getSupabaseAdminClient();

    let query = supabase
      .from("bylaws")
      .select("id, slug, title, bylaw_number, status, category, year")
      .eq("municipality_id", muni.id);

    // Apply filters
    if (status) query = query.eq("status", status);
    if (category) query = query.eq("category", category);
    if (year) query = query.eq("year", year);

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
      throw new ApiError(500, "QUERY_ERROR", "Failed to fetch bylaws");

    const page = extractPage(rows ?? [], per_page, "id");

    return listResponse(c, page.data.map(serializeBylawSummary), {
      has_more: page.has_more,
      next_cursor: page.next_cursor,
      per_page,
    });
  }
}
