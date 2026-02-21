/**
 * OCD Bill endpoint handlers.
 *
 * Plain Hono handlers (not chanfana OpenAPIRoute classes) since OCD endpoints
 * have their own specification and don't need OpenAPI generation.
 *
 * Bills map from matters. View Royal has ~1727 matters, so the reverse-
 * lookup for detail endpoints scans the full set.
 */

import type { Context } from "hono";
import type { ApiEnv } from "../../types";
import { getSupabaseAdminClient } from "~/lib/supabase.server";
import { ApiError } from "../../lib/api-errors";
import { ocdIds, ocdOrganizationId } from "../lib/ocd-ids";
import { parsePaginationParams, computePagination } from "../lib/pagination";
import { ocdListResponse, ocdDetailResponse } from "../lib/ocd-envelope";
import {
  serializeBillSummary,
  serializeBillDetail,
} from "../serializers/bill";

/**
 * Fetch the OCD Organization ID for the Council in this municipality.
 * Returns the OCD ID string, or a fallback empty string if not found.
 */
async function getCouncilOrgOcdId(
  supabase: any,
  municipalityId: string,
): Promise<string> {
  const { data: councilOrg } = await supabase
    .from("organizations")
    .select("id")
    .eq("municipality_id", municipalityId)
    .eq("classification", "Council")
    .maybeSingle();

  if (councilOrg?.id) {
    return await ocdOrganizationId(councilOrg.id);
  }
  return "";
}

/**
 * GET /:municipality/bills
 *
 * Returns a paginated list of OCD Bill objects for the municipality.
 * Supports optional filtering by `status` and `updated_since`.
 */
export async function listBills(c: Context<ApiEnv>) {
  const muni = c.get("municipality")!;
  const { page, perPage } = parsePaginationParams(c);
  const supabase = getSupabaseAdminClient();

  // Parse optional filters
  const status = c.req.query("status");
  const updatedSince = c.req.query("updated_since");

  const offset = (page - 1) * perPage;

  let query = supabase
    .from("matters")
    .select(
      "id, title, identifier, description, status, category, first_seen, created_at",
      { count: "exact" },
    )
    .eq("municipality_id", muni.id);

  // Apply filters
  if (status) query = query.eq("status", status);
  if (updatedSince) query = query.gte("created_at", updatedSince);

  query = query
    .order("first_seen", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .range(offset, offset + perPage - 1);

  const { data: rows, error, count } = await query;

  if (error) {
    console.error("[OCD] listBills query error:", error);
    throw new ApiError(500, "QUERY_ERROR", "Failed to fetch bills");
  }

  const total = count ?? 0;
  const matters = rows ?? [];

  // Pre-compute OCD IDs and get Council org OCD ID in parallel
  const matterPks = matters.map((m: any) => m.id);
  const [matterOcdIds, orgOcdId] = await Promise.all([
    ocdIds("bill", matterPks),
    getCouncilOrgOcdId(supabase, muni.id),
  ]);

  const results = matters.map((matter: any) =>
    serializeBillSummary(matter, matterOcdIds.get(matter.id)!, orgOcdId),
  );

  const pagination = computePagination(total, page, perPage);

  return ocdListResponse(c, results, pagination);
}

/**
 * GET /:municipality/bills/:id
 *
 * Returns a single OCD Bill with full action history and sponsors.
 * Uses OCD ID reverse-lookup across all matters for the municipality.
 */
export async function getBill(c: Context<ApiEnv>) {
  const muni = c.get("municipality")!;
  const id = c.req.param("id");
  const supabase = getSupabaseAdminClient();

  // Fetch ALL matters for the municipality to reverse-lookup OCD ID
  const { data: allMatters, error } = await supabase
    .from("matters")
    .select(
      "id, title, identifier, description, status, category, first_seen, document_url, created_at",
    )
    .eq("municipality_id", muni.id);

  if (error) {
    console.error("[OCD] getBill query error:", error);
    throw new ApiError(500, "QUERY_ERROR", "Failed to fetch matters");
  }

  const matters = allMatters ?? [];
  const matterPks = matters.map((m: any) => m.id);
  const matterOcdIds = await ocdIds("bill", matterPks);

  // Find the matter matching the OCD ID
  const matchingMatter = matters.find(
    (m: any) => matterOcdIds.get(m.id) === id,
  );

  if (!matchingMatter) {
    throw new ApiError(
      404,
      "BILL_NOT_FOUND",
      `Bill "${id}" not found.`,
    );
  }

  // Fetch related data: agenda items linked to this matter (with meeting dates)
  const { data: agendaItems, error: aiError } = await supabase
    .from("agenda_items")
    .select("id, title, item_order, category, meeting:meetings(meeting_date)")
    .eq("matter_id", matchingMatter.id);

  if (aiError) {
    console.error("[OCD] getBill agenda_items error:", aiError);
  }

  const items = agendaItems ?? [];

  // Fetch motions linked to the matter's agenda items
  const agendaItemIds = items.map((ai: any) => ai.id);
  let motions: any[] = [];

  if (agendaItemIds.length > 0) {
    const { data: motionRows, error: motionError } = await supabase
      .from("motions")
      .select("mover, mover_person_id, mover_id")
      .in("agenda_item_id", agendaItemIds);

    if (motionError) {
      console.error("[OCD] getBill motions error:", motionError);
    }

    motions = (motionRows ?? []).map((m: any) => ({
      ...m,
      // Use mover_id as mover_person_id fallback if mover_person_id doesn't exist
      mover_person_id: m.mover_person_id ?? m.mover_id,
    }));
  }

  // Pre-compute mover OCD IDs
  const moverPks = motions
    .map((m: any) => m.mover_person_id)
    .filter((id: any): id is number => id != null);
  const moverOcdIds = await ocdIds("person", moverPks);

  // Get Council org OCD ID
  const orgOcdId = await getCouncilOrgOcdId(supabase, muni.id);

  const result = serializeBillDetail(matchingMatter, id, orgOcdId, {
    agendaItems: items,
    motions,
    moverOcdIds,
  });

  return ocdDetailResponse(c, result);
}
