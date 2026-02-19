import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMeetings, getMeetingById } from "~/services/meetings";
import type { GetMeetingsOptions } from "~/services/meetings";

// Helper to create a chainable mock Supabase query builder
function createMockQueryBuilder(returnData: any = [], returnError: any = null) {
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: returnData, error: returnError }),
    then: undefined as any,
  };

  // Make the builder itself thenable (for awaiting without .single())
  const promise = Promise.resolve({ data: returnData, error: returnError });
  builder.then = promise.then.bind(promise);

  return builder;
}

// Helper to create a mock Supabase client
function createMockSupabase(builders?: Record<string, any>) {
  return {
    from: vi.fn((table: string) => {
      if (builders && builders[table]) {
        return builders[table];
      }
      return createMockQueryBuilder();
    }),
  } as any;
}

describe("getMeetings", () => {
  it("queries the meetings table with organization join", async () => {
    const builder = createMockQueryBuilder([]);
    const supabase = createMockSupabase({ meetings: builder });

    await getMeetings(supabase);

    expect(supabase.from).toHaveBeenCalledWith("meetings");
    expect(builder.select).toHaveBeenCalledWith(
      expect.stringContaining("organization:organizations(*)"),
    );
  });

  it("does not include neighborhood column in select", async () => {
    const builder = createMockQueryBuilder([]);
    const supabase = createMockSupabase({ meetings: builder });

    await getMeetings(supabase);

    const selectString = builder.select.mock.calls[0][0];
    expect(selectString).not.toContain("neighborhood");
  });

  it("applies default ordering by meeting_date desc", async () => {
    const builder = createMockQueryBuilder([]);
    const supabase = createMockSupabase({ meetings: builder });

    await getMeetings(supabase);

    expect(builder.order).toHaveBeenCalledWith("meeting_date", {
      ascending: false,
    });
  });

  it("applies custom ordering", async () => {
    const builder = createMockQueryBuilder([]);
    const supabase = createMockSupabase({ meetings: builder });

    await getMeetings(supabase, {
      orderBy: "title",
      orderDirection: "asc",
    });

    expect(builder.order).toHaveBeenCalledWith("title", { ascending: true });
  });

  it("applies limit when provided", async () => {
    const builder = createMockQueryBuilder([]);
    const supabase = createMockSupabase({ meetings: builder });

    await getMeetings(supabase, { limit: 10 });

    expect(builder.limit).toHaveBeenCalledWith(10);
  });

  it("does not apply limit when not provided", async () => {
    const builder = createMockQueryBuilder([]);
    const supabase = createMockSupabase({ meetings: builder });

    await getMeetings(supabase);

    expect(builder.limit).not.toHaveBeenCalled();
  });

  it("filters by status", async () => {
    const builder = createMockQueryBuilder([]);
    const supabase = createMockSupabase({ meetings: builder });

    await getMeetings(supabase, { status: "published" });

    expect(builder.eq).toHaveBeenCalledWith("status", "published");
  });

  it("filters by organization_id", async () => {
    const builder = createMockQueryBuilder([]);
    const supabase = createMockSupabase({ meetings: builder });

    await getMeetings(supabase, { organization_id: 5 });

    expect(builder.eq).toHaveBeenCalledWith("organization_id", 5);
  });

  it("filters by has_transcript", async () => {
    const builder = createMockQueryBuilder([]);
    const supabase = createMockSupabase({ meetings: builder });

    await getMeetings(supabase, { has_transcript: true });

    expect(builder.eq).toHaveBeenCalledWith("has_transcript", true);
  });

  it("filters by date range", async () => {
    const builder = createMockQueryBuilder([]);
    const supabase = createMockSupabase({ meetings: builder });

    await getMeetings(supabase, {
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    });

    expect(builder.gte).toHaveBeenCalledWith("meeting_date", "2025-01-01");
    expect(builder.lte).toHaveBeenCalledWith("meeting_date", "2025-12-31");
  });

  it("applies multiple filters simultaneously", async () => {
    const builder = createMockQueryBuilder([]);
    const supabase = createMockSupabase({ meetings: builder });

    await getMeetings(supabase, {
      status: "published",
      has_transcript: true,
      limit: 5,
      startDate: "2025-01-01",
    });

    expect(builder.eq).toHaveBeenCalledWith("status", "published");
    expect(builder.eq).toHaveBeenCalledWith("has_transcript", true);
    expect(builder.gte).toHaveBeenCalledWith("meeting_date", "2025-01-01");
    expect(builder.limit).toHaveBeenCalledWith(5);
  });

  it("returns empty array when no data", async () => {
    const builder = createMockQueryBuilder(null);
    const supabase = createMockSupabase({ meetings: builder });

    const result = await getMeetings(supabase);

    expect(result).toEqual([]);
  });

  it("returns meetings data on success", async () => {
    const mockMeetings = [
      { id: 1, title: "Council Meeting", meeting_date: "2025-06-01" },
      { id: 2, title: "Committee Meeting", meeting_date: "2025-05-15" },
    ];
    const builder = createMockQueryBuilder(mockMeetings);
    const supabase = createMockSupabase({ meetings: builder });

    const result = await getMeetings(supabase);

    expect(result).toEqual(mockMeetings);
  });

  it("throws on Supabase error", async () => {
    const builder = createMockQueryBuilder(null, {
      message: "Database connection error",
    });
    const supabase = createMockSupabase({ meetings: builder });

    await expect(getMeetings(supabase)).rejects.toThrow(
      "Database connection error",
    );
  });

  it("select string includes expected columns", async () => {
    const builder = createMockQueryBuilder([]);
    const supabase = createMockSupabase({ meetings: builder });

    await getMeetings(supabase);

    const selectString = builder.select.mock.calls[0][0] as string;
    const expectedColumns = [
      "id",
      "organization_id",
      "title",
      "meeting_date",
      "type",
      "status",
      "video_url",
      "minutes_url",
      "agenda_url",
      "video_duration_seconds",
      "summary",
      "has_agenda",
      "has_minutes",
      "has_transcript",
      "created_at",
    ];

    for (const col of expectedColumns) {
      expect(selectString).toContain(col);
    }
  });
});

describe("getMeetingById", () => {
  it("queries by meeting id with .single()", async () => {
    const meetingBuilder = createMockQueryBuilder({
      id: 1,
      meeting_date: "2025-06-01",
    });
    const agendaBuilder = createMockQueryBuilder([]);
    const aliasBuilder = createMockQueryBuilder([]);
    const attendanceBuilder = createMockQueryBuilder([]);
    const transcriptBuilder = createMockQueryBuilder([]);
    const membershipBuilder = createMockQueryBuilder([]);
    const peopleBuilder = createMockQueryBuilder([]);

    const supabase = {
      from: vi.fn((table: string) => {
        switch (table) {
          case "meetings":
            return meetingBuilder;
          case "agenda_items":
            return agendaBuilder;
          case "meeting_speaker_aliases":
            return aliasBuilder;
          case "attendance":
            return attendanceBuilder;
          case "transcript_segments":
            return transcriptBuilder;
          case "memberships":
            return membershipBuilder;
          case "people":
            return peopleBuilder;
          default:
            return createMockQueryBuilder();
        }
      }),
    } as any;

    await getMeetingById(supabase, "1");

    expect(supabase.from).toHaveBeenCalledWith("meetings");
    expect(meetingBuilder.eq).toHaveBeenCalledWith("id", "1");
    expect(meetingBuilder.single).toHaveBeenCalled();
  });

  it("throws 'Meeting Not Found' for PGRST116 error code", async () => {
    const meetingBuilder = createMockQueryBuilder(null, {
      code: "PGRST116",
      message: "Row not found",
    });
    // The other tables still need builders since Promise.all runs all concurrently
    const agendaBuilder = createMockQueryBuilder([]);
    const aliasBuilder = createMockQueryBuilder([]);
    const attendanceBuilder = createMockQueryBuilder([]);

    const supabase = {
      from: vi.fn((table: string) => {
        switch (table) {
          case "meetings":
            return meetingBuilder;
          case "agenda_items":
            return agendaBuilder;
          case "meeting_speaker_aliases":
            return aliasBuilder;
          case "attendance":
            return attendanceBuilder;
          default:
            return createMockQueryBuilder();
        }
      }),
    } as any;

    await expect(getMeetingById(supabase, "999")).rejects.toThrow(
      "Meeting Not Found",
    );
  });

  it("fetches agenda items for the meeting", async () => {
    const meetingBuilder = createMockQueryBuilder({
      id: 1,
      meeting_date: "2025-06-01",
    });
    const agendaBuilder = createMockQueryBuilder([]);
    const aliasBuilder = createMockQueryBuilder([]);
    const attendanceBuilder = createMockQueryBuilder([]);
    const transcriptBuilder = createMockQueryBuilder([]);
    const membershipBuilder = createMockQueryBuilder([]);
    const peopleBuilder = createMockQueryBuilder([]);

    const supabase = {
      from: vi.fn((table: string) => {
        switch (table) {
          case "meetings":
            return meetingBuilder;
          case "agenda_items":
            return agendaBuilder;
          case "meeting_speaker_aliases":
            return aliasBuilder;
          case "attendance":
            return attendanceBuilder;
          case "transcript_segments":
            return transcriptBuilder;
          case "memberships":
            return membershipBuilder;
          case "people":
            return peopleBuilder;
          default:
            return createMockQueryBuilder();
        }
      }),
    } as any;

    await getMeetingById(supabase, "1");

    expect(supabase.from).toHaveBeenCalledWith("agenda_items");
    expect(agendaBuilder.eq).toHaveBeenCalledWith("meeting_id", "1");
  });

  it("returns structured response with all sections", async () => {
    const meetingData = {
      id: 1,
      title: "Regular Council",
      meeting_date: "2025-06-01",
      chair_person_id: null,
    };
    const agendaData = [
      { id: 10, title: "Old Business", motions: [] },
    ];

    const meetingBuilder = createMockQueryBuilder(meetingData);
    const agendaBuilder = createMockQueryBuilder(agendaData);
    const aliasBuilder = createMockQueryBuilder([]);
    const attendanceBuilder = createMockQueryBuilder([]);
    const transcriptBuilder = createMockQueryBuilder([]);
    const membershipBuilder = createMockQueryBuilder([]);

    const supabase = {
      from: vi.fn((table: string) => {
        switch (table) {
          case "meetings":
            return meetingBuilder;
          case "agenda_items":
            return agendaBuilder;
          case "meeting_speaker_aliases":
            return aliasBuilder;
          case "attendance":
            return attendanceBuilder;
          case "transcript_segments":
            return transcriptBuilder;
          case "memberships":
            return membershipBuilder;
          default:
            return createMockQueryBuilder();
        }
      }),
    } as any;

    const result = await getMeetingById(supabase, "1");

    expect(result).toHaveProperty("meeting");
    expect(result).toHaveProperty("agendaItems");
    expect(result).toHaveProperty("transcript");
    expect(result).toHaveProperty("speakerAliases");
    expect(result).toHaveProperty("attendance");
    expect(result).toHaveProperty("people");
    expect(result).toHaveProperty("activeCouncilMemberIds");
    expect(result.meeting).toEqual(meetingData);
    expect(result.agendaItems).toEqual(agendaData);
  });
});
