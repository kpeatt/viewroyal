import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { ApiEnv } from "../../types";
import type { Context } from "hono";
import { getSupabaseAdminClient } from "~/lib/supabase.server";
import { detailResponse } from "../../lib/envelope";
import { serializeMotionDetail } from "../../serializers/motion";
import { ApiError } from "../../lib/api-errors";

/**
 * GET /api/v1/:municipality/motions/:slug
 *
 * Returns motion detail with person joins (mover, seconder), meeting,
 * agenda item, and full roll call votes.
 *
 * Motions don't have municipality_id -- municipality ownership is verified
 * via the joined meeting.
 */
export class GetMotion extends OpenAPIRoute {
  schema = {
    summary: "Get motion detail",
    description:
      "Returns a single motion by slug, including the full text, mover/seconder info, and individual roll call votes.",
    request: {
      params: z.object({
        municipality: z.string(),
        slug: z.string(),
      }),
    },
    responses: {
      "200": {
        description: "Motion detail with roll call votes",
      },
      "404": {
        description: "Motion not found",
      },
    },
  };

  async handle(c: Context<ApiEnv>) {
    const { slug } = c.req.param();
    const muni = c.get("municipality")!;
    const supabase = getSupabaseAdminClient();

    // Lookup by slug, verify municipality via inner join on meetings
    const { data: motion, error } = await supabase
      .from("motions")
      .select(
        "id, slug, text_content, plain_english_summary, result, mover_id, seconder_id, meetings!inner(slug, meeting_date, municipality_id), mover_person:people!motions_mover_id_fkey(name), seconder_person:people!motions_seconder_id_fkey(name), agenda_items(slug, title)",
      )
      .eq("slug", slug)
      .eq("meetings.municipality_id", muni.id)
      .maybeSingle();

    if (error)
      throw new ApiError(500, "QUERY_ERROR", "Failed to fetch motion");
    if (!motion)
      throw new ApiError(
        404,
        "MOTION_NOT_FOUND",
        `Motion "${slug}" not found in ${muni.name}.`,
      );

    // Fetch roll call votes in parallel
    const { data: votes } = await supabase
      .from("votes")
      .select("id, vote, recusal_reason, person:people(slug, name)")
      .eq("motion_id", motion.id)
      .order("id", { ascending: true });

    return detailResponse(
      c,
      serializeMotionDetail(motion, { votes: votes ?? [] }),
    );
  }
}
