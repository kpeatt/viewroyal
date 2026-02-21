import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { ApiEnv } from "../../types";
import type { Context } from "hono";
import { getSupabaseAdminClient } from "~/lib/supabase.server";
import { detailResponse } from "../../lib/envelope";
import { serializeMeetingDetail } from "../../serializers/meeting";
import { ApiError } from "../../lib/api-errors";

export class GetMeeting extends OpenAPIRoute {
  schema = {
    summary: "Get meeting detail",
    description:
      "Returns a single meeting with inline agenda item, motion, and attendance summaries.",
    request: {
      params: z.object({
        slug: z.string().describe("Meeting slug"),
        municipality: z.string().describe("Municipality slug"),
      }),
    },
    responses: {
      "200": {
        description: "Meeting detail",
        content: {
          "application/json": {
            schema: z.object({
              data: z.object({
                slug: z.string().nullable(),
                title: z.string().nullable(),
                date: z.string().nullable(),
                type: z.string().nullable(),
                has_agenda: z.boolean(),
                has_minutes: z.boolean(),
                has_transcript: z.boolean(),
                organization: z.string().nullable(),
                summary: z.string().nullable(),
                video_url: z.string().nullable(),
                minutes_url: z.string().nullable(),
                agenda_url: z.string().nullable(),
                video_duration_seconds: z.number().nullable(),
                chair: z
                  .object({
                    slug: z.string().nullable(),
                    name: z.string().nullable(),
                  })
                  .nullable(),
                agenda_items: z.array(z.any()),
                motions: z.array(z.any()),
                attendance: z.array(z.any()),
              }),
              meta: z.object({
                request_id: z.string(),
              }),
            }),
          },
        },
      },
      "404": {
        description: "Meeting not found",
      },
    },
  };

  async handle(c: Context<ApiEnv>) {
    const { slug } = c.req.param();
    const muni = c.get("municipality")!;
    const supabase = getSupabaseAdminClient();

    // Fetch meeting by slug + municipality
    const { data: meeting, error } = await supabase
      .from("meetings")
      .select(
        "id, slug, title, meeting_date, type, has_agenda, has_minutes, has_transcript, video_url, minutes_url, agenda_url, video_duration_seconds, summary, organization:organizations(name, slug), chair:people!meetings_chair_person_id_fkey(slug, name)",
      )
      .eq("slug", slug)
      .eq("municipality_id", muni.id)
      .maybeSingle();

    if (error) {
      console.error("[API] GetMeeting query error:", error);
      throw new ApiError(
        500,
        "QUERY_ERROR",
        "Failed to fetch meeting",
      );
    }

    if (!meeting) {
      throw new ApiError(
        404,
        "MEETING_NOT_FOUND",
        `Meeting "${slug}" not found in ${muni.name}.`,
      );
    }

    // Fetch related data in parallel
    const [agendaRes, motionRes, attendanceRes] = await Promise.all([
      supabase
        .from("agenda_items")
        .select("slug, title, item_order, category")
        .eq("meeting_id", meeting.id)
        .order("item_order", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true }),
      supabase
        .from("motions")
        .select(
          "slug, text_content, plain_english_summary, result, mover, seconder",
        )
        .eq("meeting_id", meeting.id)
        .order("id", { ascending: true }),
      supabase
        .from("attendance")
        .select(
          "attendance_mode, person:people(slug, name)",
        )
        .eq("meeting_id", meeting.id),
    ]);

    if (agendaRes.error) {
      console.error("[API] GetMeeting agenda_items error:", agendaRes.error);
    }
    if (motionRes.error) {
      console.error("[API] GetMeeting motions error:", motionRes.error);
    }
    if (attendanceRes.error) {
      console.error("[API] GetMeeting attendance error:", attendanceRes.error);
    }

    const serialized = serializeMeetingDetail(meeting, {
      agendaItems: agendaRes.data ?? [],
      motions: motionRes.data ?? [],
      attendance: attendanceRes.data ?? [],
    });

    return detailResponse(c, serialized);
  }
}
