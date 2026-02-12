import type { SupabaseClient } from "@supabase/supabase-js";

async function fetchAllVotesForAlignment(
  supabase: SupabaseClient,
): Promise<any[]> {
  const allData: any[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("votes")
      .select(
        "motion_id, person_id, vote, motions(meeting_id, meetings(meeting_date))",
      )
      .in("vote", ["Yes", "No", "Opposed", "In Favour"])
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allData.push(...data);
    if (data.length < pageSize) break;
    page++;
  }

  return allData;
}

export async function getVotingAlignment(supabase: SupabaseClient) {
  // 1. Get the 'Council' organization ID dynamically
  const { data: councilOrg } = await supabase
    .from("organizations")
    .select("id")
    .eq("classification", "Council")
    .single();

  const councilId = councilOrg?.id || 1;

  const [peopleRes, votes, electionsRes, membershipsRes] = await Promise.all([
    supabase.from("people").select("id, name, image_url, is_councillor"),
    fetchAllVotesForAlignment(supabase),
    supabase
      .from("elections")
      .select("*")
      .order("election_date", { ascending: false }),
    supabase
      .from("memberships")
      .select("*, people(id, name, image_url)")
      .eq("organization_id", councilId),
  ]);

  return {
    people: peopleRes.data || [],
    votes: votes || [],
    elections: electionsRes.data || [],
    memberships: membershipsRes.data || [],
  };
}
