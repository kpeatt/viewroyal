/**
 * OCD Vote endpoint handlers.
 *
 * Plain Hono handlers (not chanfana OpenAPIRoute classes) since OCD endpoints
 * have their own specification and don't need OpenAPI generation.
 *
 * Votes map from motions. View Royal has ~10536 motions, so the reverse-
 * lookup for detail endpoints is the heaviest of all OCD entity types.
 */

import type { Context } from "hono";
import type { ApiEnv } from "../../types";
import { getSupabaseAdminClient } from "~/lib/supabase.server";
import { ApiError } from "../../lib/api-errors";
import { ocdIds, ocdOrganizationId, ocdBillId } from "../lib/ocd-ids";
import { parsePaginationParams, computePagination } from "../lib/pagination";
import { ocdListResponse, ocdDetailResponse } from "../lib/ocd-envelope";
import { fetchAll } from "../lib/fetch-all";
import {
  serializeVoteSummary,
  serializeVoteDetail,
} from "../serializers/vote";

/**
 * GET /:municipality/votes
 *
 * Returns a paginated list of OCD Vote objects for the municipality.
 * Supports optional date range filtering via `before` and `after` params.
 */
export async function listVotes(c: Context<ApiEnv>) {
  const muni = c.get("municipality")!;
  const { page, perPage } = parsePaginationParams(c);
  const supabase = getSupabaseAdminClient();

  // Parse optional date range filters
  const before = c.req.query("before");
  const after = c.req.query("after");

  const offset = (page - 1) * perPage;

  // Motions scoped via inner join on meetings
  let query = supabase
    .from("motions")
    .select(
      "id, text_content, plain_english_summary, result, mover, seconder, yes_votes, no_votes, abstain_votes, created_at, meeting:meetings!inner(meeting_date, municipality_id, organization:organizations(name, id))",
      { count: "exact" },
    )
    .eq("meeting.municipality_id", muni.id);

  // Apply date filters on meeting_date
  if (after) query = query.gte("meeting.meeting_date", after);
  if (before) query = query.lte("meeting.meeting_date", before);

  // Note: PostgREST does not support ordering on nested fields (meeting.meeting_date)
  // so we order by id DESC as a proxy for chronological order (motions IDs increase over time)
  query = query
    .order("id", { ascending: false })
    .range(offset, offset + perPage - 1);

  const { data: rows, error, count } = await query;

  if (error) {
    console.error("[OCD] listVotes query error:", error);
    throw new ApiError(500, "QUERY_ERROR", "Failed to fetch votes");
  }

  const total = count ?? 0;
  const motions = rows ?? [];

  // Pre-compute OCD IDs for motions
  const motionPks = motions.map((m: any) => m.id);
  const motionOcdIds = await ocdIds("vote", motionPks);

  // Get Council org OCD ID
  const { data: councilOrg } = await supabase
    .from("organizations")
    .select("id")
    .eq("municipality_id", muni.id)
    .eq("classification", "Council")
    .maybeSingle();

  const orgOcdId = councilOrg?.id
    ? await ocdOrganizationId(councilOrg.id)
    : "";

  const results = motions.map((motion: any) => {
    // Extract meeting_date and organization_name from nested join
    // meeting is an inner join (single object), but TS may infer array -- cast
    const mtg = motion.meeting as any;
    const meetingDate = mtg?.meeting_date ?? null;
    const orgName = mtg?.organization?.name ?? "Council";

    return serializeVoteSummary(
      {
        ...motion,
        meeting_date: meetingDate,
        organization_name: orgName,
      },
      motionOcdIds.get(motion.id)!,
      orgOcdId,
    );
  });

  const pagination = computePagination(total, page, perPage);

  return ocdListResponse(c, results, pagination);
}

/**
 * GET /:municipality/votes/:id
 *
 * Returns a single OCD Vote with full roll call and vote counts.
 * Uses OCD ID reverse-lookup across all motions for the municipality.
 */
export async function getVote(c: Context<ApiEnv>) {
  const muni = c.get("municipality")!;
  const id = c.req.param("id");
  const supabase = getSupabaseAdminClient();

  // Fetch ALL motions for the municipality via inner join on meetings.
  // PostgREST caps at 1000 rows per request, so we paginate in batches.
  let motions: any[];
  try {
    motions = await fetchAll(
      supabase,
      "motions",
      "id, text_content, plain_english_summary, result, mover, seconder, yes_votes, no_votes, abstain_votes, created_at, agenda_item_id, meeting:meetings!inner(meeting_date, municipality_id, organization:organizations(name, id))",
      (q: any) => q.eq("meeting.municipality_id", muni.id),
    );
  } catch (error) {
    console.error("[OCD] getVote query error:", error);
    throw new ApiError(500, "QUERY_ERROR", "Failed to fetch motions");
  }
  const motionPks = motions.map((m: any) => m.id);
  const motionOcdIds = await ocdIds("vote", motionPks);

  // Find the motion matching the OCD ID
  const matchingMotion = motions.find(
    (m: any) => motionOcdIds.get(m.id) === id,
  );

  if (!matchingMotion) {
    throw new ApiError(
      404,
      "VOTE_NOT_FOUND",
      `Vote "${id}" not found.`,
    );
  }

  // Fetch individual votes (roll call)
  const { data: individualVotes, error: votesError } = await supabase
    .from("votes")
    .select("id, vote, person_id, person:people(id, name)")
    .eq("motion_id", matchingMotion.id)
    .order("id", { ascending: true });

  if (votesError) {
    console.error("[OCD] getVote individual votes error:", votesError);
  }

  // Pre-compute voter OCD IDs
  const voterPks = (individualVotes ?? [])
    .map((v: any) => v.person_id)
    .filter((id: any): id is number => id != null);
  const voterOcdIds = await ocdIds("person", voterPks);

  // Determine linked bill OCD ID (matter via agenda_item.matter_id)
  let billOcdId: string | null = null;
  let matterTitle: string | null = null;

  if (matchingMotion.agenda_item_id) {
    const { data: agendaItem } = await supabase
      .from("agenda_items")
      .select("matter_id, matter:matters(id, title)")
      .eq("id", matchingMotion.agenda_item_id)
      .maybeSingle();

    // matter is a FK join (single object), but TS may infer array -- cast
    const matter = agendaItem?.matter as any;
    if (matter?.id) {
      billOcdId = await ocdBillId(matter.id);
      matterTitle = matter.title ?? null;
    }
  }

  // Get Council org OCD ID
  const { data: councilOrg } = await supabase
    .from("organizations")
    .select("id")
    .eq("municipality_id", muni.id)
    .eq("classification", "Council")
    .maybeSingle();

  const orgOcdId = councilOrg?.id
    ? await ocdOrganizationId(councilOrg.id)
    : "";

  // Extract meeting_date and organization_name from nested join
  // meeting is an inner join (single object), but TS may infer array -- cast
  const meetingJoin = matchingMotion.meeting as any;
  const meetingDate = meetingJoin?.meeting_date ?? null;
  const orgName = meetingJoin?.organization?.name ?? "Council";

  const result = serializeVoteDetail(
    {
      ...matchingMotion,
      meeting_date: meetingDate,
      organization_name: orgName,
      matter_title: matterTitle,
    },
    id,
    orgOcdId,
    {
      individualVotes: individualVotes ?? [],
      voterOcdIds,
      billOcdId,
    },
  );

  return ocdDetailResponse(c, result);
}
