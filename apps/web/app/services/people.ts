import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Person,
  Membership,
  Attendance,
  Meeting,
  Vote,
} from "../lib/types";

export interface PersonWithStats extends Person {
  memberships: Membership[];
  stats: {
    rate: number;
    total: number;
    attended: number;
  };
}

export function calculateAttendance(
  person: Person & { memberships: Membership[] },
  allMeetings: Meeting[],
  allAttendance: Attendance[],
  councilId: number,
  period?: { start: string; end: string },
) {
  let councilMeetings = allMeetings.filter(
    (m) => m.organization_id === councilId,
  );

  // Exclude future meetings
  const now = new Date().toISOString();
  councilMeetings = councilMeetings.filter((m) => m.meeting_date <= now);

  if (period) {
    councilMeetings = councilMeetings.filter(
      (m) => m.meeting_date >= period.start && m.meeting_date <= period.end,
    );
  }

  const personAttendance = allAttendance.filter(
    (a) => a.person_id === person.id,
  );

  const expectedMeetings = councilMeetings.filter((meeting) => {
    return person.memberships?.some((m) => {
      if (m.organization_id !== councilId) return false;

      if (m.start_date && meeting.meeting_date < m.start_date) return false;
      if (m.end_date && meeting.meeting_date > m.end_date) return false;

      return true;
    });
  });

  const totalExpected = expectedMeetings.length;
  if (totalExpected === 0) return { rate: 0, total: 0, attended: 0 };

  const attendedCount = personAttendance.filter((record) => {
    return (
      expectedMeetings.some((m) => m.id === record.meeting_id) &&
      record.attendance_mode !== "Absent" &&
      record.attendance_mode !== "Regrets"
    );
  }).length;

  return {
    rate: Math.round((attendedCount / totalExpected) * 100),
    total: totalExpected,
    attended: attendedCount,
  };
}

async function fetchAllAttendance(
  supabase: SupabaseClient,
): Promise<Attendance[]> {
  const allData: Attendance[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("attendance")
      .select("meeting_id, person_id, attendance_mode")
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allData.push(...(data as Attendance[]));
    if (data.length < pageSize) break;
    page++;
  }

  return allData;
}

export async function getRawPeopleData(supabase: SupabaseClient) {
  const { data: councilOrg } = await supabase
    .from("organizations")
    .select("id")
    .eq("classification", "Council")
    .single();

  const councilId = councilOrg?.id;
  if (!councilId) throw new Error("Council org not found");

  const [peopleRes, meetingsRes, attendance] = await Promise.all([
    supabase
      .from("people")
      .select(
        "id, name, is_councillor, image_url, bio, memberships(id, organization_id, role, start_date, end_date, organization:organizations(classification))",
      )
      .eq("memberships.organization_id", councilId),
    supabase
      .from("meetings")
      .select("id, organization_id, meeting_date")
      .eq("organization_id", councilId)
      .order("meeting_date", { ascending: false }),
    fetchAllAttendance(supabase),
  ]);

  const people = (peopleRes.data || []).filter(
    (p) =>
      p.memberships &&
      p.memberships.some((m: any) => m.organization_id === councilId),
  ) as unknown as (Person & { memberships: Membership[] })[];

  return {
    people,
    meetings: (meetingsRes.data || []) as Meeting[],
    attendance,
    councilId,
  };
}

export async function getPeopleWithStats(
  supabase: SupabaseClient,
): Promise<PersonWithStats[]> {
  // 1. Get the 'Council' organization ID
  const { data: councilOrg } = await supabase
    .from("organizations")
    .select("id")
    .eq("classification", "Council")
    .single();

  const councilId = councilOrg?.id;
  if (!councilId) return [];

  // 2. Fetch all people who have or had a membership in the Council
  const [peopleRes, meetingsRes, attendanceRes] = await Promise.all([
    supabase
      .from("people")
      .select(
        "id, name, is_councillor, image_url, bio, created_at, memberships(id, organization_id, role, start_date, end_date, organization:organizations(id, name, classification))",
      )
      .eq("memberships.organization_id", councilId),
    supabase
      .from("meetings")
      .select("id, organization_id, meeting_date")
      .eq("organization_id", councilId)
      .order("meeting_date", { ascending: false }),
    fetchAllAttendance(supabase),
  ]);

  if (peopleRes.error) throw new Error(peopleRes.error.message);

  // Filter people who actually have council memberships (inner join simulation)
  const councilMembers = (peopleRes.data || []).filter(
    (p) =>
      p.memberships &&
      p.memberships.some((m: any) => m.organization_id === councilId),
  ) as unknown as (Person & { memberships: Membership[] })[];

  const allMeetings = (meetingsRes.data || []) as Meeting[];
  const allAttendance = attendanceRes as Attendance[];

  // Calculate stats
  const peopleWithStats = councilMembers
    .map((person) => ({
      ...person,
      stats: calculateAttendance(person, allMeetings, allAttendance, councilId),
    }))
    .sort((a, b) => {
      // Sort by active status first, then name
      if (a.is_councillor && !b.is_councillor) return -1;
      if (!a.is_councillor && b.is_councillor) return 1;
      return a.name.localeCompare(b.name);
    });

  return peopleWithStats;
}

export async function getElections(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("elections")
    .select("*")
    .order("election_date", { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

async function fetchAllVotesForPerson(
  supabase: SupabaseClient,
  personId: string | number,
): Promise<any[]> {
  const allData: any[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("votes")
      .select(
        "id, motion_id, person_id, vote, recusal_reason, created_at, motions(id, text_content, result, meeting_id, meetings(id, title, meeting_date))",
      )
      .eq("person_id", personId)
      .order("created_at", { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allData.push(...data);
    if (data.length < pageSize) break;
    page++;
  }

  return allData;
}

async function fetchAllAttendanceForPerson(
  supabase: SupabaseClient,
  personId: string | number,
  page = 0,
  pageSize = 20,
): Promise<{ data: any[]; total: number }> {
  const { data, count, error } = await supabase
    .from("attendance")
    .select(
      "id, meeting_id, person_id, attendance_mode, notes, created_at, meetings(id, title, meeting_date, organizations(name))",
      { count: "exact" },
    )
    .eq("person_id", personId)
    .order("meetings(meeting_date)", { ascending: false }) // Sort by meeting date descending
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (error) throw error;
  return { data: data || [], total: count || 0 };
}

async function fetchAllAttendanceSimple(
  supabase: SupabaseClient,
  personId: string | number,
): Promise<Attendance[]> {
  const allData: Attendance[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("attendance")
      .select("meeting_id, person_id, attendance_mode")
      .eq("person_id", personId)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allData.push(...(data as Attendance[]));
    if (data.length < pageSize) break;
    page++;
  }

  return allData;
}

async function fetchRelevantVotesForAlignment(
  supabase: SupabaseClient,
  personId: string | number,
): Promise<any[]> {
  // 1. Get all motion IDs this person voted on
  const { data: targetVotes, error: targetError } = await supabase
    .from("votes")
    .select("motion_id")
    .eq("person_id", personId);

  if (targetError) throw targetError;
  if (!targetVotes || targetVotes.length === 0) return [];

  const motionIds = targetVotes.map((v) => v.motion_id);
  const uniqueMotionIds = Array.from(new Set(motionIds));

  const chunkSize = 50;
  const chunks = [];
  for (let i = 0; i < uniqueMotionIds.length; i += chunkSize) {
    chunks.push(uniqueMotionIds.slice(i, i + chunkSize));
  }

  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from("votes")
        .select(
          "motion_id, person_id, vote, motions(meeting_id, meetings(meeting_date))",
        )
        .in("motion_id", chunk)
        .in("vote", ["Yes", "No", "Opposed", "In Favour"]),
    ),
  );

  const allData: any[] = [];

  for (const { data, error } of results) {
    if (error) throw error;
    if (data) {
      allData.push(...data);
    }
  }

  return allData;
}

import {
  calculateAlignmentForPerson,
  parseAlignmentDate,
} from "../lib/alignment-utils";

/**
 * Optimized profile loader that only fetches counts for heavy data
 */
export async function getPersonProfile(
  supabase: SupabaseClient,
  id: string,
  attendancePage = 0,
) {
  const [
    personRes,
    attendanceRes,
    attendanceAllRes,
    voteCountRes,
    allMeetingsRes,
    candidaciesRes,
    transcriptRes,
    movedCountRes,
    secondedCountRes,
    yesVotesRes,
    noVotesRes,
    abstainVotesRes,
    electionsRes,
    allVotesForAlignment,
    membershipsRes,
  ] = await Promise.all([
    supabase
      .from("people")
      .select(
        "id, name, is_councillor, email, image_url, bio, created_at, memberships(id, organization_id, role, start_date, end_date, organization:organizations(id, name, classification))",
      )
      .eq("id", id)
      .single(),
    fetchAllAttendanceForPerson(supabase, id, attendancePage),
    fetchAllAttendanceSimple(supabase, id),
    supabase
      .from("votes")
      .select("id", { count: "exact", head: true })
      .eq("person_id", id),
    supabase
      .from("meetings")
      .select("id, organization_id, title, meeting_date, organizations(name)")
      .order("meeting_date", { ascending: false }),
    supabase
      .from("candidacies")
      .select(
        "id, is_elected, votes_received, election_offices(office, elections(name, election_date))",
      )
      .eq("person_id", id)
      .order("election_offices(elections(election_date))", {
        ascending: false,
      }),
    supabase
      .from("transcript_segments")
      .select("id, agenda_items(category)")
      .eq("person_id", id)
      .not("agenda_item_id", "is", null),
    supabase
      .from("motions")
      .select("id", { count: "exact", head: true })
      .eq("mover_id", id),
    supabase
      .from("motions")
      .select("id", { count: "exact", head: true })
      .eq("seconder_id", id),
    // Vote Breakdown
    supabase
      .from("votes")
      .select("id", { count: "exact", head: true })
      .eq("person_id", id)
      .or("vote.eq.Yes,vote.eq.In Favour"),
    supabase
      .from("votes")
      .select("id", { count: "exact", head: true })
      .eq("person_id", id)
      .or("vote.eq.No,vote.eq.Opposed"),
    supabase
      .from("votes")
      .select("id", { count: "exact", head: true })
      .eq("person_id", id)
      .or("vote.eq.Abstain,vote.eq.Recused"),
    // Alignment Data
    supabase
      .from("elections")
      .select("*")
      .order("election_date", { ascending: false }),
    fetchRelevantVotesForAlignment(supabase, id),
    supabase
      .from("memberships")
      .select("*, people(id, name, image_url)")
      .eq("organization_id", 1),
  ]);

  if (personRes.error) {
    console.error("Error fetching person:", personRes.error);
    throw new Error("Person Not Found");
  }

  // Calculate Alignment (Over entire history)
  const alignmentResults = calculateAlignmentForPerson(
    parseInt(id, 10),
    allVotesForAlignment,
    membershipsRes.data || [],
    new Date(0),
    new Date(2100, 0, 1),
  );

  return {
    person: personRes.data as unknown as Person,
    attendance: attendanceRes.data as (Attendance & {
      meetings: any;
    })[],
    attendanceTotal: attendanceRes.total,
    attendanceAll: attendanceAllRes as Attendance[],
    allMeetings: (allMeetingsRes.data || []) as any[],
    candidacies: (candidaciesRes.data || []) as any[],
    segments: (transcriptRes.data || []) as any[],
    alignmentResults,
    stats: {
      totalVotes: voteCountRes.count || 0,
      totalMoved: movedCountRes.count || 0,
      totalSeconded: secondedCountRes.count || 0,
      votesBreakdown: {
        yes: yesVotesRes.count || 0,
        no: noVotesRes.count || 0,
        abstain: abstainVotesRes.count || 0,
      },
    },
  };
}

/**
 * Fetch detailed motions (moved/seconded) for a person
 */
export async function getPersonProposals(
  supabase: SupabaseClient,
  personId: string,
  role: "mover" | "seconder",
  page = 0,
  pageSize = 50,
) {
  const column = role === "mover" ? "mover_id" : "seconder_id";
  const { data, count, error } = await supabase
    .from("motions")
    .select(
      "id, text_content, result, meeting_id, meetings(id, title, meeting_date)",
      { count: "exact" },
    )
    .eq(column, personId)
    .order("meeting_id", { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (error) throw error;
  return { data, total: count || 0 };
}

export async function getActiveCouncilMembers(
  supabase: SupabaseClient,
  date: string,
) {
  const { data: councilOrg } = await supabase
    .from("organizations")
    .select("id")
    .eq("classification", "Council")
    .single();

  if (!councilOrg) return [];

  const { data: memberships, error } = await supabase
    .from("memberships")
    .select("person:people(*)")
    .eq("organization_id", councilOrg.id)
    .lte("start_date", date)
    .or(`end_date.is.null,end_date.gte.${date}`);

  if (error) throw error;
  return (memberships?.map((m: any) => m.person) || []) as unknown as Person[];
}

/**
 * Gets a simple list of all people's names from the database.
 * This is useful for checking if a search query is about a person.
 */
export async function getPeopleNames(
  supabase: SupabaseClient,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("people")
    .select("name")
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching people names:", error);
    return [];
  }
  return (data || []).map((p: { name: string }) => p.name);
}

/**
 * A tool to find the name of the person currently holding a specific role (e.g., "Mayor").
 * @param role The role to search for.
 * @returns The name of the person, or a string indicating the role was not found.
 */
export async function get_person_by_role(
  supabase: SupabaseClient,
  {
    role,
  }: {
    role: string;
  },
): Promise<string> {
  const { data: councilOrg } = await supabase
    .from("organizations")
    .select("id")
    .eq("classification", "Council")
    .single();

  if (!councilOrg) {
    return `Error: Council organization not found.`;
  }

  const today = new Date().toISOString().split("T")[0];

  const { data: membership, error } = await supabase
    .from("memberships")
    .select("person:people(name)")
    .eq("organization_id", councilOrg.id)
    .eq("role", role)
    .lte("start_date", today)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .maybeSingle();

  if (error) {
    console.error(`Error fetching person for role "${role}":`, error);
    return `Error: An error occurred while fetching the role: ${role}.`;
  }

  if (!membership) {
    return `Error: No person found currently holding the role: ${role}.`;
  }

  const person = (membership as any).person;
  return person?.name || `Error: No person found for role: ${role}.`;
}
