import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { ApiEnv } from "../../types";
import type { Context } from "hono";
import { getSupabaseAdminClient } from "~/lib/supabase.server";
import { decodeCursor, extractPage } from "../../lib/cursor";
import { listResponse } from "../../lib/envelope";
import { serializePersonSummary } from "../../serializers/person";
import { ApiError } from "../../lib/api-errors";

export class ListPeople extends OpenAPIRoute {
  schema = {
    summary: "List people",
    description:
      "Returns a paginated list of people associated with the municipality. " +
      "Sorted alphabetically by name.",
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
        is_councillor: z.coerce
          .boolean()
          .optional()
          .describe("Filter by current councillor status"),
        name: z
          .string()
          .optional()
          .describe("Partial name search (case-insensitive)"),
      }),
    },
    responses: {
      "200": {
        description: "Paginated list of people",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(
                z.object({
                  slug: z.string().nullable(),
                  name: z.string().nullable(),
                  is_current_councillor: z.boolean(),
                  party: z.null(),
                  image_url: z.string().nullable(),
                }),
              ),
              pagination: z.object({
                has_more: z.boolean(),
                next_cursor: z.string().nullable(),
                per_page: z.number(),
              }),
              meta: z.object({
                request_id: z.string(),
              }),
            }),
          },
        },
      },
    },
  };

  async handle(c: Context<ApiEnv>) {
    const data = await this.getValidatedData<typeof this.schema>();
    const { cursor, per_page, is_councillor, name } = data.query;
    const muni = c.get("municipality")!;
    const supabase = getSupabaseAdminClient();

    // People don't have municipality_id -- scope via memberships -> organizations
    let query = supabase
      .from("people")
      .select(
        "id, slug, name, is_councillor, image_url, memberships!inner(role, start_date, end_date, organizations!inner(municipality_id))",
      )
      .eq("memberships.organizations.municipality_id", muni.id);

    // Filter by councillor status
    if (is_councillor === true) {
      query = query.eq("is_councillor", true);
    } else if (is_councillor === false) {
      query = query.eq("is_councillor", false);
    }

    // Partial name search
    if (name) {
      query = query.ilike("name", `%${name}%`);
    }

    // Apply cursor pagination (keyset: name ASC, id ASC)
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        query = query.or(
          `name.gt.${decoded.v},and(name.eq.${decoded.v},id.gt.${decoded.id})`,
        );
      }
    }

    query = query
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .limit(per_page + 1);

    const { data: rows, error } = await query;
    if (error) {
      console.error("[API] ListPeople query error:", error);
      throw new ApiError(500, "QUERY_ERROR", "Failed to fetch people");
    }

    // Deduplicate people who may appear multiple times due to multiple memberships
    const seen = new Set<number>();
    const unique = (rows ?? []).filter((row: any) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });

    const page = extractPage(unique, per_page, "name");

    return listResponse(c, page.data.map(serializePersonSummary), {
      has_more: page.has_more,
      next_cursor: page.next_cursor,
      per_page,
    });
  }
}
