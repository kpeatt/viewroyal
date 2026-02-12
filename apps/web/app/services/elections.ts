import type { SupabaseClient } from "@supabase/supabase-js";
import type { Election } from "../lib/types";

export async function getElections(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("elections")
    .select("*, election_offices(id, office, candidacies(id, is_elected))")
    .order("election_date", { ascending: false });

  if (error) throw error;
  return data as any[]; // Type needs more detail for nested relations if strictly needed
}

export async function getElectionById(supabase: SupabaseClient, id: string) {
  const { data: election, error } = await supabase
    .from("elections")
    .select(
      `
      *,
      election_offices (
        *,
        candidacies (
          *,
          people (*)
        )
      )
    `,
    )
    .eq("id", id)
    .single();

  if (error) throw error;
  return election as any;
}
