import type { SupabaseClient } from "@supabase/supabase-js";
import type { Municipality } from "../lib/types";

export async function getMunicipality(
  supabase: SupabaseClient,
  slug = "view-royal",
): Promise<Municipality> {
  const { data, error } = await supabase
    .from("municipalities")
    .select(
      "id, slug, name, short_name, province, classification, website_url, rss_url, contact_email, map_center_lat, map_center_lng, ocd_id, meta, created_at, updated_at",
    )
    .eq("slug", slug)
    .single();

  if (error || !data) {
    throw new Error(`Municipality not found: ${slug}`);
  }

  return data as Municipality;
}
