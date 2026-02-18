import type { SupabaseClient } from "@supabase/supabase-js";

export async function getPublicNotices(rssUrl?: string) {
  if (!rssUrl) return [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(rssUrl, { signal: controller.signal });
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


export async function getAboutStats(supabase: SupabaseClient) {
  const [meetingsRes, motionsRes, mattersRes, segmentsRes, hoursRes] =
    await Promise.all([
      supabase
        .from("meetings")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("motions")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("matters")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("transcript_segments")
        .select("*", { count: "exact", head: true }),
      // video_duration_seconds is backfilled from MAX(transcript_segments.end_time) per meeting.
      // The pipeline also sets this after transcript ingestion. If this returns 0,
      // run the backfill SQL in .planning/quick/3-fix-about-page-video-hours-showing-0/
      supabase
        .from("meetings")
        .select("video_duration_seconds")
        .not("video_duration_seconds", "is", null),
    ]);

  const totalSeconds = (hoursRes.data || []).reduce(
    (sum: number, m: { video_duration_seconds: number }) =>
      sum + (m.video_duration_seconds || 0),
    0,
  );

  return {
    meetings: meetingsRes.count || 0,
    motions: motionsRes.count || 0,
    matters: mattersRes.count || 0,
    segments: segmentsRes.count || 0,
    hours: Math.round(totalSeconds / 3600),
  };
}

export async function getHomeData(supabase: SupabaseClient) {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Vancouver",
  });

  // ── Batch 1: Independent queries in parallel ──

  let recentMeeting: any = null;
  let upcomingMeeting: any = null;
  let activeMattersRaw: any[] = [];
  let recentMotionsRaw: any[] = [];

  try {
    const [
      recentMeetingRes,
      upcomingMeetingRes,
      activeMattersRes,
      recentMotionsRes,
    ] = await Promise.all([
      // 1. Most recent meeting with transcript
      supabase
        .from("meetings")
        .select(
          "id, title, type, meeting_date, summary, video_duration_seconds, organizations(name)",
        )
        .eq("has_transcript", true)
        .order("meeting_date", { ascending: false })
        .limit(1)
        .single(),

      // 2. Next upcoming meeting (singular)
      supabase
        .from("meetings")
        .select(
          "id, title, meeting_date, type, has_agenda, organizations(name)",
        )
        .gt("meeting_date", today)
        .order("meeting_date", { ascending: true })
        .limit(1)
        .maybeSingle(),

      // 3. Active matters (6, ordered by last_seen)
      // NOTE: Do NOT select plain_english_summary from matters (always null)
      supabase
        .from("matters")
        .select("id, title, category, status, first_seen, last_seen")
        .eq("status", "Active")
        .order("last_seen", { ascending: false, nullsFirst: false })
        .limit(6),

      // 4. Recent non-procedural motions with vote data (15)
      // NOTE: Do NOT use motions.yes_votes/no_votes (always 0) — use nested votes(vote)
      supabase
        .from("motions")
        .select(
          "id, plain_english_summary, text_content, result, disposition, financial_cost, meeting_id, meetings!inner(id, meeting_date, title), votes(vote)",
        )
        .not("result", "is", null)
        .neq("disposition", "Procedural")
        .order("meeting_id", { ascending: false })
        .limit(15),
    ]);

    recentMeeting = recentMeetingRes.data;
    upcomingMeeting = upcomingMeetingRes.data;
    activeMattersRaw = activeMattersRes.data || [];
    recentMotionsRaw = recentMotionsRes.data || [];
  } catch (error) {
    console.error("Error in home data batch 1:", error);
  }

  // ── Batch 2: Dependent queries ──

  let agendaPreview: Array<{ title: string; category: string; summary: string | null }> = [];
  let matterSummaryMap = new Map<number, string>();
  let recentMeetingDecisions: Array<{
    id: number;
    summary: string;
    result: string;
  }> = [];
  let recentMeetingStats = {
    agendaItems: 0,
    totalMotions: 0,
    motionsPassed: 0,
    dividedVotes: 0,
    duration: null as number | null,
  };

  try {
    const batch2Promises: Promise<any>[] = [];

    // 5. Agenda preview for upcoming meeting (if it has an agenda)
    if (upcomingMeeting?.has_agenda) {
      batch2Promises.push(
        (async () => {
          const res = await supabase
            .from("agenda_items")
            .select("title, category, plain_english_summary")
            .eq("meeting_id", upcomingMeeting.id)
            .neq("category", "Procedural")
            .limit(5);
          return { type: "agendaPreview" as const, data: res.data };
        })(),
      );
    }

    // 6. Matter summaries from agenda_items (for active matters)
    const matterIds = activeMattersRaw.map((m) => m.id);
    if (matterIds.length > 0) {
      batch2Promises.push(
        (async () => {
          const res = await supabase
            .from("agenda_items")
            .select("matter_id, plain_english_summary, created_at")
            .in("matter_id", matterIds)
            .not("plain_english_summary", "is", null)
            .order("created_at", { ascending: false });
          return { type: "matterSummaries" as const, data: res.data };
        })(),
      );
    }

    // 7. Key decisions + stats for recent meeting
    if (recentMeeting?.id) {
      batch2Promises.push(
        (async () => {
          const res = await supabase
            .from("motions")
            .select(
              "id, text_content, plain_english_summary, result, disposition, agenda_items(category), votes(vote)",
            )
            .eq("meeting_id", recentMeeting.id)
            .not("result", "is", null);
          return { type: "meetingMotions" as const, data: res.data };
        })(),
      );
      batch2Promises.push(
        (async () => {
          const res = await supabase
            .from("agenda_items")
            .select("*", { count: "exact", head: true })
            .eq("meeting_id", recentMeeting.id);
          return { type: "agendaCount" as const, count: res.count };
        })(),
      );
    }

    const batch2Results = await Promise.all(batch2Promises);

    for (const result of batch2Results) {
      switch (result.type) {
        case "agendaPreview":
          agendaPreview = (result.data || []).map(
            (t: { title: string; category: string; plain_english_summary: string | null }) => ({
              title: t.title,
              category: t.category,
              summary: t.plain_english_summary,
            }),
          );
          break;

        case "matterSummaries":
          // Build map: for each matter_id, keep only the first (most recent) summary
          for (const s of result.data || []) {
            if (!matterSummaryMap.has(s.matter_id)) {
              matterSummaryMap.set(s.matter_id, s.plain_english_summary);
            }
          }
          break;

        case "meetingMotions": {
          const allMotions = result.data || [];
          const nonProcedural = allMotions.filter((m: any) => {
            if (m.disposition === "Procedural") return false;
            const category = (m.agenda_items as any)?.category;
            if (category === "Procedural") return false;
            return true;
          });

          recentMeetingDecisions = nonProcedural.slice(0, 3).map((m: any) => ({
            id: m.id,
            summary: m.plain_english_summary || m.text_content,
            result: m.result,
          }));

          // Count divided votes (motions where any vote is "No")
          const dividedCount = allMotions.filter((m: any) => {
            const votes = m.votes || [];
            return votes.some((v: { vote: string }) => v.vote === "No");
          }).length;

          recentMeetingStats = {
            agendaItems: 0, // filled below from agendaCount
            totalMotions: allMotions.length,
            motionsPassed: allMotions.filter(
              (m: any) => m.result === "CARRIED",
            ).length,
            dividedVotes: dividedCount,
            duration: recentMeeting?.video_duration_seconds
              ? Math.round(recentMeeting.video_duration_seconds / 60)
              : null,
          };
          break;
        }

        case "agendaCount":
          recentMeetingStats.agendaItems = result.count || 0;
          break;
      }
    }
  } catch (error) {
    console.error("Error in home data batch 2:", error);
  }

  // ── Post-processing ──

  // Active matters: merge summaries from agenda_items
  const activeMatters = activeMattersRaw.map((m) => ({
    id: m.id,
    title: m.title,
    category: m.category,
    status: m.status,
    first_seen: m.first_seen,
    last_seen: m.last_seen,
    summary: matterSummaryMap.get(m.id) || null,
  }));

  // Decisions feed: process vote data from nested votes(vote)
  const recentDecisions = recentMotionsRaw.map((m: any) => {
    const votes = m.votes || [];
    const yesCount = votes.filter(
      (v: { vote: string }) => v.vote === "Yes",
    ).length;
    const noCount = votes.filter(
      (v: { vote: string }) => v.vote === "No",
    ).length;
    const isDivided = noCount > 0;
    return {
      id: m.id,
      summary: m.plain_english_summary || m.text_content,
      result: m.result,
      financialCost: m.financial_cost,
      meetingId: m.meeting_id,
      meetingDate: (m.meetings as any)?.meeting_date,
      meetingTitle: (m.meetings as any)?.title,
      yesCount,
      noCount,
      isDivided,
    };
  });

  return {
    upcomingMeeting: upcomingMeeting
      ? { ...upcomingMeeting, agendaPreview }
      : null,
    recentMeeting,
    recentMeetingStats,
    recentMeetingDecisions,
    activeMatters,
    recentDecisions,
  };
}
