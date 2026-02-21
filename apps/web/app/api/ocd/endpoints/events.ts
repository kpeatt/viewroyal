/**
 * OCD Event endpoint handlers.
 *
 * Plain Hono handlers (not chanfana OpenAPIRoute classes) since OCD endpoints
 * have their own specification and don't need OpenAPI generation.
 *
 * Events map from meetings. View Royal has ~737 meetings, so the reverse-
 * lookup for detail endpoints scans the full set.
 */

import type { Context } from "hono";
import type { ApiEnv } from "../../types";
import { getSupabaseAdminClient } from "~/lib/supabase.server";
import { ApiError } from "../../lib/api-errors";
import { ocdIds } from "../lib/ocd-ids";
import { parsePaginationParams, computePagination } from "../lib/pagination";
import { ocdListResponse, ocdDetailResponse } from "../lib/ocd-envelope";
import {
  serializeEventSummary,
  serializeEventDetail,
} from "../serializers/event";

/**
 * GET /:municipality/events
 *
 * Returns a paginated list of OCD Event objects for the municipality.
 * Supports optional date range filtering via `before` and `after` params.
 */
export async function listEvents(c: Context<ApiEnv>) {
  const muni = c.get("municipality")!;
  const { page, perPage } = parsePaginationParams(c);
  const supabase = getSupabaseAdminClient();

  // Parse optional date range filters
  const before = c.req.query("before");
  const after = c.req.query("after");

  const offset = (page - 1) * perPage;

  let query = supabase
    .from("meetings")
    .select(
      "id, slug, title, meeting_date, type, video_url, agenda_url, minutes_url, summary, created_at, organization:organizations(name, id)",
      { count: "exact" },
    )
    .eq("municipality_id", muni.id);

  // Apply date filters
  if (after) query = query.gte("meeting_date", after);
  if (before) query = query.lte("meeting_date", before);

  query = query
    .order("meeting_date", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + perPage - 1);

  const { data: rows, error, count } = await query;

  if (error) {
    console.error("[OCD] listEvents query error:", error);
    throw new ApiError(500, "QUERY_ERROR", "Failed to fetch events");
  }

  const total = count ?? 0;
  const meetings = rows ?? [];

  // Pre-compute OCD IDs for all meetings in this page
  const meetingPks = meetings.map((m: any) => m.id);
  const meetingOcdIds = await ocdIds("event", meetingPks);

  const results = meetings.map((meeting: any) =>
    serializeEventSummary(meeting, meetingOcdIds.get(meeting.id)!),
  );

  const pagination = computePagination(total, page, perPage);

  return ocdListResponse(c, results, pagination);
}

/**
 * GET /:municipality/events/:id
 *
 * Returns a single OCD Event with full nested data (agenda, participants,
 * media, documents). Uses OCD ID reverse-lookup.
 */
export async function getEvent(c: Context<ApiEnv>) {
  const muni = c.get("municipality")!;
  const id = c.req.param("id");
  const supabase = getSupabaseAdminClient();

  // Fetch ALL meetings for the municipality to reverse-lookup OCD ID
  const { data: allMeetings, error } = await supabase
    .from("meetings")
    .select(
      "id, slug, title, meeting_date, type, video_url, agenda_url, minutes_url, summary, created_at",
    )
    .eq("municipality_id", muni.id);

  if (error) {
    console.error("[OCD] getEvent query error:", error);
    throw new ApiError(500, "QUERY_ERROR", "Failed to fetch meetings");
  }

  const meetings = allMeetings ?? [];
  const meetingPks = meetings.map((m: any) => m.id);
  const meetingOcdIds = await ocdIds("event", meetingPks);

  // Find the meeting matching the OCD ID
  const matchingMeeting = meetings.find(
    (m: any) => meetingOcdIds.get(m.id) === id,
  );

  if (!matchingMeeting) {
    throw new ApiError(
      404,
      "EVENT_NOT_FOUND",
      `Event "${id}" not found.`,
    );
  }

  // Fetch related data in parallel: agenda items and attendance
  const [agendaRes, attendanceRes] = await Promise.all([
    supabase
      .from("agenda_items")
      .select("id, title, item_order, category")
      .eq("meeting_id", matchingMeeting.id)
      .order("item_order", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true }),
    supabase
      .from("attendance")
      .select("attendance_mode, person:people(id, name, slug)")
      .eq("meeting_id", matchingMeeting.id),
  ]);

  if (agendaRes.error) {
    console.error("[OCD] getEvent agenda_items error:", agendaRes.error);
  }
  if (attendanceRes.error) {
    console.error("[OCD] getEvent attendance error:", attendanceRes.error);
  }

  // Pre-compute attendee OCD IDs
  const attendeePks = (attendanceRes.data ?? [])
    .map((a: any) => a.person?.id)
    .filter((id: any): id is number => id != null);
  const attendeeOcdIds = await ocdIds("person", attendeePks);

  const result = serializeEventDetail(matchingMeeting, id, {
    agendaItems: agendaRes.data ?? [],
    attendance: attendanceRes.data ?? [],
    attendeeOcdIds,
  });

  return ocdDetailResponse(c, result);
}
