import type { SupabaseClient } from "@supabase/supabase-js";
import type { Topic } from "../lib/types";

/**
 * Fetch all topics ordered by name.
 * Used by the onboarding wizard and settings page for category subscription selection.
 */
export async function getTopics(supabase: SupabaseClient): Promise<Topic[]> {
  const { data, error } = await supabase
    .from("topics")
    .select("id, name, description")
    .order("name");

  if (error) throw error;
  return (data || []) as Topic[];
}
