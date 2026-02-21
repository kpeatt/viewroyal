import { createMiddleware } from "hono/factory";
import type { ApiEnv } from "../types";
import { ApiError } from "../lib/api-errors";
import { getSupabaseAdminClient } from "~/lib/supabase.server";

/**
 * Resolves municipality from the :municipality URL param.
 * Looks up the slug in the municipalities table via Supabase.
 * Throws 404 ApiError if the municipality is not found.
 */
export const municipality = createMiddleware<ApiEnv>(async (c, next) => {
  const slug = c.req.param("municipality");

  if (!slug) {
    await next();
    return;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("municipalities")
    .select("id, slug, name, short_name, ocd_id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("[API] Municipality lookup error:", error);
    throw new ApiError(
      500,
      "INTERNAL_ERROR",
      "Failed to look up municipality",
    );
  }

  if (!data) {
    throw new ApiError(
      404,
      "MUNICIPALITY_NOT_FOUND",
      `Municipality "${slug}" not found. Use a valid municipality slug (e.g., "view-royal").`,
    );
  }

  c.set("municipality", data);
  await next();
});
