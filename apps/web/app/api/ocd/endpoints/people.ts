/**
 * OCD People endpoint handlers.
 *
 * Plain Hono handlers (not chanfana OpenAPIRoute classes) since OCD endpoints
 * have their own specification and don't need OpenAPI generation.
 *
 * People are scoped to municipality via memberships -> organizations join
 * (no municipality_id on the people table).
 */

import type { Context } from "hono";
import type { ApiEnv } from "../../types";
import { getSupabaseAdminClient } from "~/lib/supabase.server";
import { ApiError } from "../../lib/api-errors";
import { ocdIds } from "../lib/ocd-ids";
import { parsePaginationParams, computePagination } from "../lib/pagination";
import { ocdListResponse, ocdDetailResponse } from "../lib/ocd-envelope";
import {
  serializePersonSummary,
  serializePersonDetail,
} from "../serializers/person";

/**
 * GET /:municipality/people
 *
 * Returns a paginated list of OCD Person objects for the municipality.
 * People are scoped via memberships -> organizations join.
 */
export async function listPeople(c: Context<ApiEnv>) {
  const muni = c.get("municipality")!;
  const { page, perPage } = parsePaginationParams(c);
  const supabase = getSupabaseAdminClient();

  // First get total count of distinct people for this municipality
  // We need to query via the memberships -> organizations join
  const { data: allPeopleIds, error: countError } = await supabase
    .from("people")
    .select(
      "id, memberships!inner(organization:organizations!inner(municipality_id))",
    )
    .eq("memberships.organizations.municipality_id", muni.id);

  if (countError) {
    console.error("[OCD] listPeople count error:", countError);
    throw new ApiError(500, "QUERY_ERROR", "Failed to count people");
  }

  // Deduplicate people (may appear multiple times due to multiple memberships)
  const uniqueIds = new Set<number>();
  for (const row of allPeopleIds ?? []) {
    uniqueIds.add(row.id);
  }
  const total = uniqueIds.size;

  // Fetch the page of people, scoped via memberships -> organizations
  const offset = (page - 1) * perPage;
  const { data: rows, error } = await supabase
    .from("people")
    .select(
      "id, name, image_url, email, slug, is_councillor, created_at, memberships!inner(organization:organizations!inner(municipality_id))",
    )
    .eq("memberships.organizations.municipality_id", muni.id)
    .order("name", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error("[OCD] listPeople query error:", error);
    throw new ApiError(500, "QUERY_ERROR", "Failed to fetch people");
  }

  // Deduplicate and paginate in application layer
  // (Supabase/PostgREST doesn't support DISTINCT with joins well)
  const seen = new Set<number>();
  const uniqueRows: any[] = [];
  for (const row of rows ?? []) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      uniqueRows.push(row);
    }
  }

  const pageRows = uniqueRows.slice(offset, offset + perPage);

  // Pre-compute OCD IDs for people in this page
  const personPks = pageRows.map((p: any) => p.id);
  const personOcdIds = await ocdIds("person", personPks);

  const results = pageRows.map((person: any) =>
    serializePersonSummary(person, personOcdIds.get(person.id)!),
  );

  const pagination = computePagination(total, page, perPage);

  return ocdListResponse(c, results, pagination);
}

/**
 * GET /:municipality/people/:id
 *
 * Returns a single OCD Person with memberships.
 * Since we cannot reverse a UUID v5 to get the PK, we fetch all people
 * for the municipality, compute their OCD IDs, and find the match.
 */
export async function getPerson(c: Context<ApiEnv>) {
  const muni = c.get("municipality")!;
  const id = c.req.param("id");
  const supabase = getSupabaseAdminClient();

  // Fetch ALL people for the municipality via memberships -> organizations
  const { data: allPeople, error } = await supabase
    .from("people")
    .select(
      "id, name, image_url, email, slug, is_councillor, created_at, memberships!inner(organization:organizations!inner(municipality_id))",
    )
    .eq("memberships.organizations.municipality_id", muni.id);

  if (error) {
    console.error("[OCD] getPerson query error:", error);
    throw new ApiError(500, "QUERY_ERROR", "Failed to fetch people");
  }

  // Deduplicate
  const seen = new Set<number>();
  const uniquePeople: any[] = [];
  for (const row of allPeople ?? []) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      uniquePeople.push(row);
    }
  }

  // Compute OCD IDs for all people and find the match
  const personPks = uniquePeople.map((p: any) => p.id);
  const personOcdIds = await ocdIds("person", personPks);

  const matchingPerson = uniquePeople.find(
    (p: any) => personOcdIds.get(p.id) === id,
  );

  if (!matchingPerson) {
    throw new ApiError(
      404,
      "PERSON_NOT_FOUND",
      `Person "${id}" not found.`,
    );
  }

  // Fetch full memberships with organization data
  const { data: memberships, error: memError } = await supabase
    .from("memberships")
    .select(
      "role, start_date, end_date, organization:organizations(id, name, classification, municipality_id)",
    )
    .eq("person_id", matchingPerson.id);

  if (memError) {
    console.error("[OCD] getPerson memberships error:", memError);
    throw new ApiError(500, "QUERY_ERROR", "Failed to fetch memberships");
  }

  // Filter memberships to this municipality
  const muniMemberships = (memberships ?? []).filter(
    (m: any) => m.organization?.municipality_id === muni.id,
  );

  // Pre-compute OCD IDs for organizations
  const orgPks = muniMemberships
    .map((m: any) => m.organization?.id)
    .filter((id: any): id is number => id != null);
  const orgOcdIds = await ocdIds("organization", orgPks);

  const result = serializePersonDetail(
    matchingPerson,
    id,
    muniMemberships,
    orgOcdIds,
  );

  return ocdDetailResponse(c, result);
}
