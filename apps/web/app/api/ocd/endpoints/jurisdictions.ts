/**
 * OCD Jurisdiction endpoint handlers.
 *
 * Plain Hono handlers (not chanfana OpenAPIRoute classes) since OCD endpoints
 * have their own specification and don't need OpenAPI generation.
 *
 * View Royal has exactly 1 municipality, so the list always returns 1 item.
 */

import type { Context } from "hono";
import type { ApiEnv } from "../../types";
import { getSupabaseAdminClient } from "~/lib/supabase.server";
import { ApiError } from "../../lib/api-errors";
import { ocdJurisdictionId } from "../lib/ocd-ids";
import { computePagination } from "../lib/pagination";
import { ocdListResponse, ocdDetailResponse } from "../lib/ocd-envelope";
import { serializeJurisdiction } from "../serializers/jurisdiction";

/**
 * GET /:municipality/jurisdictions
 *
 * Returns a single-item list containing the municipality's OCD Jurisdiction.
 */
export async function listJurisdictions(c: Context<ApiEnv>) {
  const muni = c.get("municipality")!;
  const supabase = getSupabaseAdminClient();

  // Fetch municipality full row for website_url, created_at
  const { data: municipality, error: muniError } = await supabase
    .from("municipalities")
    .select("*")
    .eq("id", muni.id)
    .single();

  if (muniError) {
    console.error("[OCD] listJurisdictions municipality error:", muniError);
    throw new ApiError(500, "QUERY_ERROR", "Failed to fetch municipality");
  }

  const divisionId = municipality?.ocd_id ?? "";

  // Fetch organizations for completeness (reserved for legislative_sessions)
  const { data: organizations } = await supabase
    .from("organizations")
    .select("id, name, classification")
    .eq("municipality_id", muni.id);

  const jurisdiction = serializeJurisdiction(
    municipality,
    organizations ?? [],
    divisionId,
  );

  const pagination = computePagination(1, 1, 1);

  return ocdListResponse(c, [jurisdiction], pagination);
}

/**
 * GET /:municipality/jurisdictions/:id
 *
 * Returns the full OCD Jurisdiction for the given OCD jurisdiction ID.
 */
export async function getJurisdiction(c: Context<ApiEnv>) {
  const muni = c.get("municipality")!;
  const id = c.req.param("id");
  const supabase = getSupabaseAdminClient();

  // Fetch full municipality
  const { data: municipality, error: muniError } = await supabase
    .from("municipalities")
    .select("*")
    .eq("id", muni.id)
    .single();

  if (muniError) {
    console.error("[OCD] getJurisdiction municipality error:", muniError);
    throw new ApiError(500, "QUERY_ERROR", "Failed to fetch municipality");
  }

  const divisionId = municipality?.ocd_id ?? "";

  // Compute the expected jurisdiction ID and verify it matches
  const csdMatch = divisionId.match(/csd:(\d+)/);
  const csdCode = csdMatch ? csdMatch[1] : "";
  const expectedId = ocdJurisdictionId(csdCode);

  if (id !== expectedId) {
    throw new ApiError(
      404,
      "JURISDICTION_NOT_FOUND",
      `Jurisdiction "${id}" not found.`,
    );
  }

  // Fetch organizations
  const { data: organizations } = await supabase
    .from("organizations")
    .select("id, name, classification")
    .eq("municipality_id", muni.id);

  const jurisdiction = serializeJurisdiction(
    municipality,
    organizations ?? [],
    divisionId,
  );

  return ocdDetailResponse(c, jurisdiction);
}
