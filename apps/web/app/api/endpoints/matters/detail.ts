import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { ApiEnv } from "../../types";
import type { Context } from "hono";
import { getSupabaseAdminClient } from "~/lib/supabase.server";
import { detailResponse } from "../../lib/envelope";
import { serializeMatterDetail } from "../../serializers/matter";
import { ApiError } from "../../lib/api-errors";

/**
 * GET /api/v1/:municipality/matters/:slug
 *
 * Returns matter detail with agenda item timeline and motions.
 */
export class GetMatter extends OpenAPIRoute {
  schema = {
    tags: ["Matters"],
    security: [{ ApiKeyAuth: [] }],
    summary: "Get matter detail",
    description:
      "Returns a single matter by slug, including its agenda item timeline and associated motions.",
    request: {
      params: z.object({
        municipality: z.string(),
        slug: z.string(),
      }),
    },
    responses: {
      "200": {
        description: "Matter detail with timeline",
      },
      "404": {
        description: "Matter not found",
      },
    },
  };

  async handle(c: Context<ApiEnv>) {
    const { slug } = c.req.param();
    const muni = c.get("municipality")!;
    const supabase = getSupabaseAdminClient();

    // Fetch the matter
    const { data: matter, error } = await supabase
      .from("matters")
      .select(
        "id, slug, title, status, category, description, plain_english_summary, first_seen, last_seen",
      )
      .eq("slug", slug)
      .eq("municipality_id", muni.id)
      .maybeSingle();

    if (error)
      throw new ApiError(500, "QUERY_ERROR", "Failed to fetch matter");
    if (!matter)
      throw new ApiError(
        404,
        "MATTER_NOT_FOUND",
        `Matter "${slug}" not found in ${muni.name}.`,
      );

    // Fetch agenda items and motions in parallel
    const [agendaResult, motionsResult] = await Promise.all([
      supabase
        .from("agenda_items")
        .select("id, slug, title, item_order, meetings!inner(slug, meeting_date)")
        .eq("matter_id", matter.id)
        .order("id", { ascending: false }),
      supabase
        .from("motions")
        .select(
          "id, slug, text_content, plain_english_summary, result, meetings!inner(meeting_date)",
        )
        .eq("agenda_items.matter_id", matter.id)
        .order("id", { ascending: false }),
    ]);

    // For motions, we need to go through agenda_items to find motions for this matter
    // since motions don't have a direct matter_id. Let's fetch via agenda_item_ids.
    const agendaItemIds = (agendaResult.data ?? []).map((ai: any) => ai.id);
    let motions: any[] = [];
    if (agendaItemIds.length > 0) {
      const { data: motionRows } = await supabase
        .from("motions")
        .select(
          "id, slug, text_content, plain_english_summary, result, meetings(meeting_date)",
        )
        .in("agenda_item_id", agendaItemIds)
        .order("id", { ascending: false });
      motions = motionRows ?? [];
    }

    // Sort agenda items by meeting date DESC
    const agendaItems = (agendaResult.data ?? []).sort((a: any, b: any) => {
      const dateA = a.meetings?.meeting_date ?? "";
      const dateB = b.meetings?.meeting_date ?? "";
      return dateB.localeCompare(dateA);
    });

    return detailResponse(
      c,
      serializeMatterDetail(matter, {
        agendaItems,
        motions,
      }),
    );
  }
}
