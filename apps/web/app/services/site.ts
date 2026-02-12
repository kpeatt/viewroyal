import type { SupabaseClient } from "@supabase/supabase-js";

export async function getPublicNotices() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(
      "https://www.viewroyal.ca/EN/main/town/public/rss/public-notices.rss",
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    if (!response.ok) return [];
    const text = await response.text();

    // Simple regex-based RSS parsing for the environment
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(text)) !== null && items.length < 5) {
      const itemContent = match[1];
      const title = itemContent.match(/<title>(.*?)<\/title>/)?.[1] || "";
      const link = itemContent.match(/<link>(.*?)<\/link>/)?.[1] || "";
      const pubDate = itemContent.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "";

      items.push({
        title: title.replace(/<!\[CDATA\[(.*?)\]\]>/, "$1").trim(),
        link: link.trim(),
        date: pubDate.trim(),
      });
    }

    return items;
  } catch (error) {
    console.error("Error fetching public notices:", error);
    return [];
  }
}


export async function getHomeData(supabase: SupabaseClient) {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Vancouver",
  });

  // Run all independent queries in parallel
  const [
    latestMeetingRes,
    upcomingMeetingsRes,
    recentMeetingsRes,
    councilMembersRes,
    publicNotices,
  ] = await Promise.all([
    // Latest meeting with transcript (narrow select — no embedding/meta/transcript_text)
    supabase
      .from("meetings")
      .select(
        "id, title, type, meeting_date, video_url, summary, video_duration_seconds, organizations(name)",
      )
      .eq("has_transcript", true)
      .order("meeting_date", { ascending: false })
      .limit(1)
      .single(),

    // Upcoming meetings (future dates in Vancouver time)
    supabase
      .from("meetings")
      .select(
        "id, title, meeting_date, type, has_agenda, agenda_url, has_transcript, has_minutes, organizations(name)",
      )
      .gt("meeting_date", today)
      .order("meeting_date", { ascending: true })
      .limit(4),

    // Recent past meetings
    supabase
      .from("meetings")
      .select(
        "id, title, meeting_date, type, has_agenda, agenda_url, has_transcript, has_minutes, organizations(name)",
      )
      .lte("meeting_date", today)
      .order("meeting_date", { ascending: false })
      .limit(5),

    // Active council members via memberships
    supabase
      .from("memberships")
      .select(
        `
        role,
        person:people(id, name, image_url)
      `,
      )
      .eq("organization_id", 1) // Council organization
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order("role", { ascending: true }),

    getPublicNotices(),
  ]);

  // Process council members - dedupe and sort (Mayor first)
  type PersonData = { id: number; name: string; image_url: string | null };
  const councilMembers =
    councilMembersRes.data
      ?.filter((m) => m.person)
      .reduce(
        (acc, m) => {
          // Supabase returns single relation as object, handle both cases
          const personData = m.person as unknown;
          const person = (
            Array.isArray(personData) ? personData[0] : personData
          ) as PersonData;
          if (person && !acc.find((p) => p.id === person.id)) {
            acc.push({
              ...person,
              role: m.role || "Councillor",
            });
          }
          return acc;
        },
        [] as Array<PersonData & { role: string }>,
      )
      .sort((a, b) => {
        // Mayor first, then alphabetical
        if (a.role === "Mayor") return -1;
        if (b.role === "Mayor") return 1;
        return a.name.localeCompare(b.name);
      }) || [];

  // Get key decisions and agenda count for latest meeting (second parallel batch)
  const latestMeetingId = latestMeetingRes.data?.id;
  let keyDecisions: Array<{ id: number; summary: string; result: string }> = [];
  let agendaItemCount = 0;
  let allMeetingMotions: any[] = [];

  if (latestMeetingId) {
    const [motionsRes, { count }] = await Promise.all([
      // Motions scoped to latest meeting (instead of fetching 20 and filtering client-side)
      supabase
        .from("motions")
        .select(
          "id, text_content, plain_english_summary, result, meeting_id, disposition, agenda_items(category)",
        )
        .eq("meeting_id", latestMeetingId)
        .not("result", "is", null)
        .neq("disposition", "Procedural")
        .limit(10),

      // Agenda item count for latest meeting
      supabase
        .from("agenda_items")
        .select("*", { count: "exact", head: true })
        .eq("meeting_id", latestMeetingId),
    ]);

    agendaItemCount = count || 0;
    allMeetingMotions = motionsRes.data || [];

    keyDecisions = allMeetingMotions
      .filter((m) => {
        // Filter out motions from procedural agenda items
        const category = (m.agenda_items as any)?.category;
        if (category === "Procedural") return false;
        return true;
      })
      .slice(0, 3)
      .map((m) => ({
        id: m.id,
        summary: m.plain_english_summary || m.text_content,
        result: m.result,
      }));
  }

  // Calculate meeting stats
  const latestMeetingStats = {
    agendaItems: agendaItemCount,
    totalMotions: allMeetingMotions.length,
    motionsPassed: allMeetingMotions.filter((m) => m.result === "CARRIED")
      .length,
    duration: latestMeetingRes.data?.video_duration_seconds
      ? Math.round(latestMeetingRes.data.video_duration_seconds / 60)
      : null,
  };

  return {
    latestMeeting: latestMeetingRes.data,
    latestMeetingStats,
    keyDecisions,
    upcomingMeetings: upcomingMeetingsRes.data || [],
    recentMeetings: (recentMeetingsRes.data || []).filter(
      (m: any) => m.id !== latestMeetingId,
    ),
    councilMembers,
    publicNotices,
  };
}
