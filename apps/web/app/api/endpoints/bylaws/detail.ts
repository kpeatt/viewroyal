import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { ApiEnv } from "../../types";
import type { Context } from "hono";
import { getSupabaseAdminClient } from "~/lib/supabase.server";
import { detailResponse } from "../../lib/envelope";
import { serializeBylawDetail } from "../../serializers/bylaw";
import { ApiError } from "../../lib/api-errors";

/**
 * GET /api/v1/:municipality/bylaws/:slug
 *
 * Returns bylaw detail with linked matters (via matters.bylaw_id FK).
 */
export class GetBylaw extends OpenAPIRoute {
  schema = {
    tags: ["Bylaws"],
    security: [{ ApiKeyAuth: [] }],
    summary: "Get bylaw detail",
    description:
      "Returns a single bylaw by slug, including its description, summary, and linked matters.",
    request: {
      params: z.object({
        municipality: z.string(),
        slug: z.string(),
      }),
    },
    responses: {
      "200": {
        description: "Bylaw detail with linked matters",
      },
      "404": {
        description: "Bylaw not found",
      },
    },
  };

  async handle(c: Context<ApiEnv>) {
    const { slug } = c.req.param();
    const muni = c.get("municipality")!;
    const supabase = getSupabaseAdminClient();

    // Fetch the bylaw
    const { data: bylaw, error } = await supabase
      .from("bylaws")
      .select(
        "id, slug, title, bylaw_number, status, category, year, description, plain_english_summary",
      )
      .eq("slug", slug)
      .eq("municipality_id", muni.id)
      .maybeSingle();

    if (error)
      throw new ApiError(500, "QUERY_ERROR", "Failed to fetch bylaw");
    if (!bylaw)
      throw new ApiError(
        404,
        "BYLAW_NOT_FOUND",
        `Bylaw "${slug}" not found in ${muni.name}.`,
      );

    // Fetch related matters via the matters.bylaw_id FK
    const { data: matters } = await supabase
      .from("matters")
      .select("slug, title, status")
      .eq("bylaw_id", bylaw.id);

    return detailResponse(
      c,
      serializeBylawDetail(bylaw, { matters: matters ?? [] }),
    );
  }
}
