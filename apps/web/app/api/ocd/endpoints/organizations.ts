/**
 * OCD Organization endpoint handlers.
 *
 * Plain Hono handlers (not chanfana OpenAPIRoute classes) since OCD endpoints
 * have their own specification and don't need OpenAPI generation.
 *
 * View Royal has ~10 organizations, so list returns all and detail lookups
 * can scan the full set to reverse-map OCD IDs.
 */

import type { Context } from "hono";
import type { ApiEnv } from "../../types";
import { getSupabaseAdminClient } from "~/lib/supabase.server";
import { ApiError } from "../../lib/api-errors";
import { ocdIds, ocdJurisdictionId } from "../lib/ocd-ids";
import { parsePaginationParams, computePagination } from "../lib/pagination";
import { ocdListResponse, ocdDetailResponse } from "../lib/ocd-envelope";
import {
  serializeOrganizationSummary,
  serializeOrganizationDetail,
} from "../serializers/organization";

/**
 * GET /:municipality/organizations
 *
 * Returns a paginated list of OCD Organization objects for the municipality.
 */
export async function listOrganizations(c: Context<ApiEnv>) {
  const muni = c.get("municipality")!;
  const { page, perPage } = parsePaginationParams(c);
  const supabase = getSupabaseAdminClient();

  // Derive jurisdiction ID from municipality's own OCD division ID
  const divisionId = muni.ocd_id ?? "";
  const csdMatch = divisionId.match(/csd:(\d+)/);
  const csdCode = csdMatch ? csdMatch[1] : "";
  const jurisdictionId = ocdJurisdictionId(csdCode);

  // Fetch organizations with count
  const offset = (page - 1) * perPage;
  const { data: rows, error, count } = await supabase
    .from("organizations")
    .select("id, name, classification, parent_organization_id, created_at", {
      count: "exact",
    })
    .eq("municipality_id", muni.id)
    .order("name", { ascending: true })
    .range(offset, offset + perPage - 1);

  if (error) {
    console.error("[OCD] listOrganizations query error:", error);
    throw new ApiError(500, "QUERY_ERROR", "Failed to fetch organizations");
  }

  const total = count ?? 0;
  const orgs = rows ?? [];

  // Pre-compute OCD IDs for all organizations in this page
  const orgPks = orgs.map((o: any) => o.id);
  const orgOcdIds = await ocdIds("organization", orgPks);

  const results = orgs.map((org: any) =>
    serializeOrganizationSummary(org, orgOcdIds.get(org.id)!, jurisdictionId),
  );

  const pagination = computePagination(total, page, perPage);

  return ocdListResponse(c, results, pagination);
}

/**
 * GET /:municipality/organizations/:id
 *
 * Returns a single OCD Organization with posts derived from memberships.
 * Since the dataset is tiny (~10 rows), we fetch all organizations for the
 * municipality, compute their OCD IDs, and find the matching one.
 */
export async function getOrganization(c: Context<ApiEnv>) {
  const muni = c.get("municipality")!;
  const id = c.req.param("id");
  const supabase = getSupabaseAdminClient();

  // Derive jurisdiction ID from municipality's own OCD division ID
  const divisionId = muni.ocd_id ?? "";
  const csdMatch = divisionId.match(/csd:(\d+)/);
  const csdCode = csdMatch ? csdMatch[1] : "";
  const jurisdictionId = ocdJurisdictionId(csdCode);

  // Fetch ALL organizations for the municipality (only ~10 rows)
  const { data: allOrgs, error } = await supabase
    .from("organizations")
    .select("id, name, classification, parent_organization_id, created_at")
    .eq("municipality_id", muni.id);

  if (error) {
    console.error("[OCD] getOrganization query error:", error);
    throw new ApiError(500, "QUERY_ERROR", "Failed to fetch organizations");
  }

  const orgs = allOrgs ?? [];
  const orgPks = orgs.map((o: any) => o.id);
  const orgOcdIds = await ocdIds("organization", orgPks);

  // Find the organization matching the OCD ID
  const matchingOrg = orgs.find(
    (org: any) => orgOcdIds.get(org.id) === id,
  );

  if (!matchingOrg) {
    throw new ApiError(
      404,
      "ORGANIZATION_NOT_FOUND",
      `Organization "${id}" not found.`,
    );
  }

  // Fetch memberships for this organization with person data
  const { data: memberships, error: memError } = await supabase
    .from("memberships")
    .select("role, start_date, end_date, person:people(id, name)")
    .eq("organization_id", matchingOrg.id);

  if (memError) {
    console.error("[OCD] getOrganization memberships error:", memError);
    throw new ApiError(500, "QUERY_ERROR", "Failed to fetch memberships");
  }

  // Pre-compute OCD IDs for member people
  const memberPks = (memberships ?? [])
    .map((m: any) => m.person?.id)
    .filter((id: any): id is number => id != null);
  const memberOcdIds = await ocdIds("person", memberPks);

  const result = serializeOrganizationDetail(
    matchingOrg,
    id,
    jurisdictionId,
    memberships ?? [],
    memberOcdIds,
  );

  return ocdDetailResponse(c, result);
}
