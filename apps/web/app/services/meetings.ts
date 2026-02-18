import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Meeting,
  AgendaItem,
  TranscriptSegment,
  SpeakerAlias,
  Attendance,
  DocumentSection,
  ExtractedDocument,
} from "../lib/types";

export interface GetMeetingsOptions {
  limit?: number;
  orderBy?: keyof Meeting;
  orderDirection?: "asc" | "desc";
  status?: string;
  organization_id?: number;
  has_transcript?: boolean;
  has_minutes?: boolean;
  has_agenda?: boolean;
  startDate?: string;
  endDate?: string;
}

export async function getMeetings(
  supabase: SupabaseClient,
  options: GetMeetingsOptions = {},
) {
  const {
    limit,
    orderBy = "meeting_date",
    orderDirection = "desc",
    status,
    organization_id,
    has_transcript,
    has_minutes,
    has_agenda,
    startDate,
    endDate,
  } = options;

  let query = supabase
    .from("meetings")
    .select(
      "id, organization_id, title, meeting_date, type, status, video_url, minutes_url, agenda_url, video_duration_seconds, summary, has_agenda, has_minutes, has_transcript, created_at, organization:organizations(*)",
    );

  if (status) {
    query = query.eq("status", status);
  }
  if (organization_id) {
    query = query.eq("organization_id", organization_id);
  }
  if (has_transcript !== undefined) {
    query = query.eq("has_transcript", has_transcript);
  }
  if (has_minutes !== undefined) {
    query = query.eq("has_minutes", has_minutes);
  }
  if (has_agenda !== undefined) {
    query = query.eq("has_agenda", has_agenda);
  }
  if (startDate) {
    query = query.gte("meeting_date", startDate);
  }
  if (endDate) {
    query = query.lte("meeting_date", endDate);
  }

  query = query.order(orderBy, { ascending: orderDirection === "asc" });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching meetings:", error);
    throw new Error(error.message);
  }

  return (data || []) as unknown as Meeting[];
}

export async function getMeetingById(supabase: SupabaseClient, id: string) {
  // 1. Fetch meeting, agenda, aliases, attendance
  const [meetingRes, agendaRes, aliasRes, attendanceRes] = await Promise.all([
    supabase
      .from("meetings")
      .select(
        "id, organization_id, title, meeting_date, type, status, has_agenda, has_minutes, has_transcript, video_url, minutes_url, agenda_url, video_duration_seconds, chair_person_id, archive_path, summary, meta, created_at, organization:organizations(*), chair:people(*)",
      )
      .eq("id", id)
      .single(),
    supabase
      .from("agenda_items")
      .select(
        "id, meeting_id, matter_id, parent_id, item_order, title, description, category, debate_summary, plain_english_summary, is_controversial, is_consent_agenda, discussion_start_time, discussion_end_time, financial_cost, funding_source, related_address, matter_status_snapshot, keywords, source_file, meta, created_at, motions(id, meeting_id, agenda_item_id, mover, seconder, mover_id, seconder_id, text_content, plain_english_summary, result, disposition, time_offset_seconds, financial_cost, funding_source, yes_votes, no_votes, abstain_votes, absent_votes, meta, created_at, votes(id, motion_id, person_id, vote, recusal_reason, created_at))",
      )
      .eq("meeting_id", id)
      .order("discussion_start_time", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true }),
    supabase
      .from("meeting_speaker_aliases")
      .select("id, meeting_id, speaker_label, person_id, created_at")
      .eq("meeting_id", id),
    supabase
      .from("attendance")
      .select("id, meeting_id, person_id, attendance_mode, notes, created_at")
      .eq("meeting_id", id),
  ]);

  if (meetingRes.error) {
    console.error("Error fetching meeting:", meetingRes.error);
    if (meetingRes.error.code === "PGRST116") {
      throw new Error("Meeting Not Found");
    }
    throw new Error(meetingRes.error.message);
  }

  if (agendaRes.error) {
    console.error("Error fetching agenda items:", agendaRes.error);
  }

  if (aliasRes.error) {
    console.error("Error fetching speaker aliases:", aliasRes.error);
  }

  if (attendanceRes.error) {
    console.error("Error fetching attendance:", attendanceRes.error);
  }

  // Fetch active council members for this meeting date to track regrets
  // We need to know who *should* be there, even if they aren't in the attendance list
  const { data: councilMemberships } = await supabase
    .from("memberships")
    .select("person_id, organization!inner(classification)")
    .eq("organization.classification", "Council")
    .lte("start_date", meetingRes.data.meeting_date)
    .or(`end_date.is.null,end_date.gte.${meetingRes.data.meeting_date}`);

  const activeCouncilMemberIds = (councilMemberships || []).map(
    (m: any) => m.person_id,
  );

  // 2. Fetch transcript segments with manual pagination to bypass 1000 limit
  const transcript: TranscriptSegment[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("transcript_segments")
      .select(
        "id, start_time, end_time, text_content, person_id, agenda_item_id, motion_id, speaker_name, speaker_role",
      )
      .eq("meeting_id", id)
      .order("start_time", { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error("Error fetching transcript segments:", error);
      break;
    }

    if (data && data.length > 0) {
      transcript.push(...(data as TranscriptSegment[]));
      hasMore = data.length === pageSize;
      page++;
    } else {
      hasMore = false;
    }
  }

  // 3. Collect all unique person IDs to fetch details once
  const personIds = new Set<number>();
  if (meetingRes.data?.chair_person_id)
    personIds.add(meetingRes.data.chair_person_id);

  (agendaRes.data || []).forEach((item: any) => {
    (item.motions || []).forEach((motion: any) => {
      if (motion.mover_id) personIds.add(motion.mover_id);
      if (motion.seconder_id) personIds.add(motion.seconder_id);
      (motion.votes || []).forEach((vote: any) => {
        if (vote.person_id) personIds.add(vote.person_id);
      });
    });
  });

  (aliasRes.data || []).forEach((a: any) => personIds.add(a.person_id));
  (attendanceRes.data || []).forEach((a: any) => personIds.add(a.person_id));
  transcript.forEach((s) => {
    if (s.person_id) personIds.add(s.person_id);
  });
  activeCouncilMemberIds.forEach((id: number) => personIds.add(id));

  // 4. Fetch people details with memberships once
  const peopleMap: Record<number, any> = {};
  if (personIds.size > 0) {
    const { data: peopleData } = await supabase
      .from("people")
      .select(
        "id, name, is_councillor, memberships(role, start_date, end_date, organization:organizations(name, classification))",
      )
      .in("id", Array.from(personIds));

    if (peopleData) {
      peopleData.forEach((p) => {
        peopleMap[p.id] = p;
      });
    }
  }

  // 5. Build Normalized Response
  // We return the people map separately and let the client look up people by ID
  // This avoids repeating the same person/membership data thousands of times in the transcript
  return {
    meeting: meetingRes.data as unknown as Meeting,
    agendaItems: (agendaRes.data || []) as AgendaItem[],
    transcript: transcript as TranscriptSegment[],
    speakerAliases: (aliasRes.data || []) as SpeakerAlias[],
    attendance: (attendanceRes.data || []) as Attendance[],
    people: peopleMap,
    activeCouncilMemberIds,
  };
}

export async function getDividedDecisions(supabase: SupabaseClient) {
  const { data: votes, error } = await supabase
    .from("votes")
    .select(
      `
      motion_id,
      vote,
      person:people(name),
      motion:motions(
        id,
        text_content,
        result,
        meeting_id,
        meetings(meeting_date, title, organizations(name))
      )
    `,
    )
    .in("vote", ["Yes", "No"]);

  if (error) throw error;

  // Process votes into divided motions
  const motionsMap: Record<number, any> = {};
  (votes || []).forEach((v: any) => {
    if (!v.motion) return;
    const mid = v.motion.id;
    if (!motionsMap[mid]) {
      motionsMap[mid] = {
        ...v.motion,
        yes_votes: [],
        no_votes: [],
      };
    }
    if (v.vote === "Yes") motionsMap[mid].yes_votes.push(v.person?.name);
    if (v.vote === "No") motionsMap[mid].no_votes.push(v.person?.name);
  });

  const dividedMotions = Object.values(motionsMap)
    .filter((m: any) => m.no_votes.length > 0)
    .sort(
      (a: any, b: any) =>
        new Date(b.meetings.meeting_date).getTime() -
        new Date(a.meetings.meeting_date).getTime(),
    );

  return dividedMotions;
}

export async function getDocumentSectionsForMeeting(
  supabase: SupabaseClient,
  meetingId: string,
): Promise<DocumentSection[]> {
  // First get document IDs for this meeting
  const { data: docs } = await supabase
    .from("documents")
    .select("id")
    .eq("meeting_id", meetingId);

  if (!docs || docs.length === 0) return [];

  const docIds = docs.map((d: any) => d.id);
  const { data, error } = await supabase
    .from("document_sections")
    .select(
      "id, document_id, agenda_item_id, extracted_document_id, section_title, section_text, section_order, page_start, page_end, token_count",
    )
    .in("document_id", docIds)
    .order("document_id", { ascending: true })
    .order("section_order", { ascending: true });

  if (error) {
    console.error("Error fetching document sections:", error);
    return [];
  }
  return (data ?? []) as DocumentSection[];
}

export async function getExtractedDocumentsForDocument(
  supabase: SupabaseClient,
  documentId: string,
): Promise<ExtractedDocument[]> {
  const { data, error } = await supabase
    .from("extracted_documents")
    .select(
      "id, document_id, agenda_item_id, title, document_type, page_start, page_end, summary, key_facts, created_at",
    )
    .eq("document_id", documentId)
    .order("page_start", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true });

  if (error) {
    console.error("Error fetching extracted documents:", error);
    return [];
  }
  return (data ?? []) as ExtractedDocument[];
}

export async function getExtractedDocumentsForMeeting(
  supabase: SupabaseClient,
  meetingId: string,
): Promise<ExtractedDocument[]> {
  // First get document IDs for this meeting
  const { data: docs } = await supabase
    .from("documents")
    .select("id")
    .eq("meeting_id", meetingId);

  if (!docs || docs.length === 0) return [];

  const docIds = docs.map((d: any) => d.id);
  const { data, error } = await supabase
    .from("extracted_documents")
    .select(
      "id, document_id, agenda_item_id, title, document_type, page_start, page_end, summary, key_facts, created_at",
    )
    .in("document_id", docIds)
    .order("document_id", { ascending: true })
    .order("page_start", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true });

  if (error) {
    console.error("Error fetching extracted documents for meeting:", error);
    return [];
  }
  return (data ?? []) as ExtractedDocument[];
}
