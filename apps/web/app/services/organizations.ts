import type { SupabaseClient } from "@supabase/supabase-js";
import type { Organization } from "../lib/types";

export async function getOrganizations(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .order("name");

  if (error) throw error;
  return data as Organization[];
}

export async function getOrganizationById(
  supabase: SupabaseClient,
  id: number,
) {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as Organization;
}
