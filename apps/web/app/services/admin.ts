import type { SupabaseClient } from "@supabase/supabase-js";
import type { Person, Membership, Organization } from "../lib/types";

export async function getAllPeople(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("people")
    .select(
      "id, name, is_councillor, image_url, bio, created_at, memberships(id, role, organization:organizations(name))",
    )
    .order("name");

  if (error) throw error;
  return data || [];
}

export async function getPerson(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("people")
    .select(
      "id, name, is_councillor, image_url, bio, memberships(id, organization_id, role, start_date, end_date, organization:organizations(id, name, classification))",
    )
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function updatePerson(
  supabase: SupabaseClient,
  id: string,
  updates: Partial<Person>,
) {
  const { error } = await supabase.from("people").update(updates).eq("id", id);

  if (error) throw error;
}

export async function createPerson(supabase: SupabaseClient, name: string) {
  const { data, error } = await supabase
    .from("people")
    .insert({ name })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getAllOrganizations(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, classification")
    .order("classification")
    .order("name");

  if (error) throw error;
  return data || [];
}

export async function addMembership(
  supabase: SupabaseClient,
  membership: Partial<Membership>,
) {
  const { error } = await supabase.from("memberships").insert(membership);

  if (error) throw error;
}

export async function updateMembership(
  supabase: SupabaseClient,
  id: string,
  updates: Partial<Membership>,
) {
  const { error } = await supabase
    .from("memberships")
    .update(updates)
    .eq("id", id);

  if (error) throw error;
}

export async function deleteMembership(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("memberships").delete().eq("id", id);

  if (error) throw error;
}
