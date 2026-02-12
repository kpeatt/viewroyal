import type { SupabaseClient } from "@supabase/supabase-js";
import type { Matter, AgendaItem } from "../lib/types";

export async function getMatters(supabase: SupabaseClient) {
  const allData: any[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("matters")
      .select(
        `
        id,
        title,
        identifier,
        category,
        status,
        first_seen,
        last_seen,
        geo_location,
        bylaw:bylaws(title, bylaw_number),
        agenda_items(related_address, geo_location)
      `,
      )
      .order("last_seen", { ascending: false, nullsFirst: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allData.push(...data);
    offset += pageSize;

    if (data.length < pageSize) break;
  }

  return allData.map((matter) => {
    // Aggregate addresses from agenda items
    const addresses = new Set<string>();
    (matter.agenda_items || []).forEach((item: any) => {
      if (item.related_address && Array.isArray(item.related_address)) {
        item.related_address.forEach((addr: string) => addresses.add(addr));
      }
    });

    // Aggregate locations from matter + agenda items
    const locationsMap = new Map<string, any>();
    const mGeo = matter.geo_location as any;
    if (mGeo?.lat && mGeo?.lng) {
      locationsMap.set(`${mGeo.lat},${mGeo.lng}`, mGeo);
    }
    (matter.agenda_items || []).forEach((item: any) => {
      const g = item.geo_location;
      if (g?.lat && g?.lng) {
        locationsMap.set(`${g.lat},${g.lng}`, {
          ...g,
          address: item.related_address?.[0],
        });
      }
    });

    // Exclude agenda_items from response
    const { agenda_items, geo_location, ...rest } = matter;
    return {
      ...rest,
      addresses: Array.from(addresses),
      locations: Array.from(locationsMap.values()),
    };
  });
}

export async function getMatterById(supabase: SupabaseClient, id: string) {
  const { data: matter, error: matterError } = await supabase
    .from("matters")
    .select(
      "id, title, identifier, description, category, plain_english_summary, status, first_seen, last_seen, bylaw_id, meta, created_at, bylaw:bylaws(id, title, bylaw_number, year, category, status, plain_english_summary, full_text, created_at), agenda_items(id, meeting_id, item_order, title, description, category, debate_summary, plain_english_summary, is_controversial, is_consent_agenda, discussion_start_time, financial_cost, funding_source, related_address, matter_status_snapshot, meetings(id, title, meeting_date, organizations(name)), motions(id, meeting_id, agenda_item_id, mover, seconder, mover_id, seconder_id, text_content, result, disposition, yes_votes, no_votes, abstain_votes, absent_votes, votes(id, motion_id, person_id, vote, recusal_reason, person:people(id, name, image_url))))",
    )
    .eq("id", id)
    .single();

  if (matterError) throw matterError;

  return matter as unknown as Matter & {
    agenda_items: (AgendaItem & {
      meetings: any;
      motions: any;
    })[];
  };
}

export async function getHotTopics(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("agenda_items")
    .select(
      "id, meeting_id, title, description, category, debate_summary, plain_english_summary, is_controversial, discussion_start_time, created_at, meetings(id, title, meeting_date, organizations(name))",
    )
    .eq("is_controversial", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as any[];
}

export async function getFiscalData(supabase: SupabaseClient) {
  const { data: items, error } = await supabase
    .from("agenda_items")
    .select(
      "id, meeting_id, title, description, category, financial_cost, funding_source, created_at, meetings(id, title, meeting_date, organizations(name))",
    )
    .not("financial_cost", "is", null)
    .order("financial_cost", { ascending: false });

  if (error) throw error;
  return items || [];
}
