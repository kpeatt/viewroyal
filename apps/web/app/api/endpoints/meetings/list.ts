import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { ApiEnv } from "../../types";
import type { Context } from "hono";
import { getSupabaseAdminClient } from "~/lib/supabase.server";
import { decodeCursor, extractPage } from "../../lib/cursor";
import { listResponse } from "../../lib/envelope";
import { serializeMeetingSummary } from "../../serializers/meeting";
import { ApiError } from "../../lib/api-errors";

export class ListMeetings extends OpenAPIRoute {
  schema = {
    tags: ["Meetings"],
    security: [{ ApiKeyAuth: [] }],
    summary: "List meetings",
    description:
      "Returns a paginated list of meetings with optional filters. " +
      "Sorted by meeting date descending (most recent first).",
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
        type: z.string().optional().describe("Filter by meeting type"),
        date_from: z
          .string()
          .optional()
          .describe(
            "Filter meetings on or after this date (YYYY-MM-DD)",
          ),
        date_to: z
          .string()
          .optional()
          .describe(
            "Filter meetings on or before this date (YYYY-MM-DD)",
          ),
        has_transcript: z.coerce
          .boolean()
          .optional()
          .describe("Filter by transcript availability"),
        organization: z
          .string()
          .optional()
          .describe("Filter by organization slug"),
      }),
    },
    responses: {
      "200": {
        description: "Paginated list of meetings",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(
                z.object({
                  slug: z.string().nullable(),
                  title: z.string().nullable(),
                  date: z.string().nullable(),
                  type: z.string().nullable(),
                  has_agenda: z.boolean(),
                  has_minutes: z.boolean(),
                  has_transcript: z.boolean(),
                  organization: z.string().nullable(),
                  summary: z.string().nullable(),
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
    const {
      cursor,
      per_page,
      type,
      date_from,
      date_to,
      has_transcript,
      organization,
    } = data.query;
    const muni = c.get("municipality")!;
    const supabase = getSupabaseAdminClient();

    let query = supabase
      .from("meetings")
      .select(
        "id, slug, title, meeting_date, type, has_agenda, has_minutes, has_transcript, summary, organization:organizations(name, slug)",
      )
      .eq("municipality_id", muni.id);

    // Apply filters
    if (type) query = query.eq("type", type);
    if (date_from) query = query.gte("meeting_date", date_from);
    if (date_to) query = query.lte("meeting_date", date_to);
    if (has_transcript !== undefined)
      query = query.eq("has_transcript", has_transcript);
    if (organization)
      query = query.eq("organization.slug", organization);

    // Apply cursor pagination (keyset: meeting_date DESC, id DESC)
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        query = query.or(
          `meeting_date.lt.${decoded.v},and(meeting_date.eq.${decoded.v},id.lt.${decoded.id})`,
        );
      }
    }

    query = query
      .order("meeting_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(per_page + 1);

    const { data: rows, error } = await query;
    if (error) {
      console.error("[API] ListMeetings query error:", error);
      throw new ApiError(500, "QUERY_ERROR", "Failed to fetch meetings");
    }

    const page = extractPage(rows ?? [], per_page, "meeting_date");

    return listResponse(c, page.data.map(serializeMeetingSummary), {
      has_more: page.has_more,
      next_cursor: page.next_cursor,
      per_page,
    });
  }
}
