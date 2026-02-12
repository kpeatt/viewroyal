import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bylaw } from "../lib/types";

export async function getBylaws(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("bylaws")
    .select(
      "id, title, bylaw_number, year, category, status, plain_english_summary",
    )
    .order("title", { ascending: true });

  if (error) throw error;
  return data as Bylaw[];
}

export async function getBylawById(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("bylaws")
    .select(
      `
      *,
      matters (
        id,
        title,
        status,
        identifier,
        agenda_items (
          id,
          title,
          meeting_id,
          meetings (
            id,
            meeting_date,
            title,
            organizations (
              name
            )
          )
        )
      )
    `,
    )
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as Bylaw;
}
