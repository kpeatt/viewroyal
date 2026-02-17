/**
 * Supabase Edge Function: send-alerts
 *
 * Called after pipeline ingestion completes for a meeting (digest mode)
 * or before an upcoming meeting (pre_meeting mode).
 *
 * Matches meeting content against user subscriptions, builds digests
 * or pre-meeting alerts, and sends email alerts via Resend.
 *
 * POST /send-alerts
 * Body: { meeting_id: number, mode?: "digest" | "pre_meeting" }
 * Headers: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 *
 * Modes:
 *   digest (default) - Post-meeting digest with subscription highlighting
 *   pre_meeting - Pre-meeting alert with matched agenda items and attending info
 *
 * Environment variables:
 *   RESEND_API_KEY - Resend API key for sending emails
 *   SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key for DB access
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL = "ViewRoyal.ai <alerts@viewroyal.ai>";
const BASE_URL = "https://viewroyal.ai";

interface DigestPayload {
  meeting: {
    id: number;
    title: string;
    meeting_date: string;
    type: string;
    summary: string;
    has_minutes: boolean;
    has_transcript: boolean;
  };
  key_decisions: {
    motion_id: number;
    agenda_item_title: string;
    motion_text: string;
    result: string;
    yes_votes: number;
    no_votes: number;
    is_divided: boolean;
    financial_cost?: number;
    neighborhood?: string;
    related_address?: string;
  }[];
  controversial_items: {
    id: number;
    title: string;
    summary: string;
    debate_summary: string;
    neighborhood?: string;
    related_address?: string;
  }[];
  attendance: {
    person_name: string;
    mode: string;
  }[];
}

interface Subscriber {
  user_id: string;
  subscription_id: number;
  subscription_type: string;
  notification_email: string;
}

interface SubscriptionDetail {
  id: number;
  type: string;
  matter_id?: number;
  topic_id?: number;
  person_id?: number;
  neighborhood?: string;
  keyword?: string;
}

interface HighlightInfo {
  reason: string;
}

/**
 * Given the digest data and this subscriber's matched subscription details,
 * returns a Map of item identifier -> reason string.
 *
 * Item identifiers use the format:
 *   - "decision:{motion_id}" for key_decisions
 *   - "controversial:{agenda_item_id}" for controversial_items
 *
 * The RPC has already confirmed WHICH subscription types matched for this subscriber.
 * This function maps those matched types back to specific items for visual highlighting.
 */
async function getHighlightedItems(
  supabase: ReturnType<typeof createClient>,
  digest: DigestPayload,
  meetingId: number,
  subscriberSubs: SubscriptionDetail[],
): Promise<Map<string, HighlightInfo>> {
  const highlights = new Map<string, HighlightInfo>();

  // We need agenda item details to match against subscription types
  // Query agenda items for this meeting with their matter info
  const { data: agendaItems } = await supabase
    .from("agenda_items")
    .select("id, title, matter_id, related_address, geo, matters(id, category)")
    .eq("meeting_id", meetingId);

  // Build lookup maps from agenda items
  const agendaByTitle = new Map<string, any>();
  const agendaById = new Map<number, any>();
  for (const ai of agendaItems || []) {
    agendaByTitle.set(ai.title, ai);
    agendaById.set(ai.id, ai);
  }

  // Query motions for this meeting to link motion_id -> agenda_item
  const { data: motions } = await supabase
    .from("motions")
    .select("id, agenda_item_id, mover_id, seconder_id")
    .eq("meeting_id", meetingId);

  const motionMap = new Map<number, any>();
  for (const m of motions || []) {
    motionMap.set(m.id, m);
  }

  // For topic subscriptions with topic_id, resolve topic name
  const topicIds = subscriberSubs
    .filter((s) => s.type === "topic" && s.topic_id)
    .map((s) => s.topic_id!);

  let topicNames = new Map<number, string>();
  if (topicIds.length > 0) {
    const { data: topics } = await supabase
      .from("topics")
      .select("id, name")
      .in("id", topicIds);
    for (const t of topics || []) {
      topicNames.set(t.id, t.name);
    }
  }

  // For person subscriptions, get person names
  const personIds = subscriberSubs
    .filter((s) => s.type === "person" && s.person_id)
    .map((s) => s.person_id!);

  let personNames = new Map<number, string>();
  if (personIds.length > 0) {
    const { data: people } = await supabase
      .from("people")
      .select("id, name")
      .in("id", personIds);
    for (const p of people || []) {
      personNames.set(p.id, p.name);
    }
  }

  // Process each subscription type
  for (const sub of subscriberSubs) {
    switch (sub.type) {
      case "matter": {
        // Highlight decisions where the motion's agenda_item's matter_id matches
        for (const decision of digest.key_decisions) {
          const motion = motionMap.get(decision.motion_id);
          if (motion) {
            const ai = agendaById.get(motion.agenda_item_id);
            if (ai && ai.matter_id === sub.matter_id) {
              const reason = `Matter: ${decision.agenda_item_title}`;
              highlights.set(`decision:${decision.motion_id}`, { reason });
            }
          }
        }
        // Also check controversial items (id = agenda_item_id)
        for (const item of digest.controversial_items) {
          const ai = agendaById.get(item.id);
          if (ai && ai.matter_id === sub.matter_id) {
            highlights.set(`controversial:${item.id}`, {
              reason: `Matter: ${item.title}`,
            });
          }
        }
        break;
      }

      case "person": {
        // Highlight decisions where the subscribed person moved or seconded
        const pName = personNames.get(sub.person_id!) || "a councillor you follow";
        for (const decision of digest.key_decisions) {
          const motion = motionMap.get(decision.motion_id);
          if (
            motion &&
            (motion.mover_id === sub.person_id ||
              motion.seconder_id === sub.person_id)
          ) {
            highlights.set(`decision:${decision.motion_id}`, {
              reason: `${pName} (councillor)`,
            });
          }
        }
        break;
      }

      case "topic": {
        if (sub.topic_id) {
          // Category-based topic: match matter category against topic name
          const topicName = topicNames.get(sub.topic_id);
          if (topicName) {
            for (const decision of digest.key_decisions) {
              const motion = motionMap.get(decision.motion_id);
              if (motion) {
                const ai = agendaById.get(motion.agenda_item_id);
                if (ai?.matters?.category === topicName) {
                  highlights.set(`decision:${decision.motion_id}`, {
                    reason: `${topicName} (topic)`,
                  });
                }
              }
            }
            for (const item of digest.controversial_items) {
              const ai = agendaById.get(item.id);
              if (ai?.matters?.category === topicName) {
                highlights.set(`controversial:${item.id}`, {
                  reason: `${topicName} (topic)`,
                });
              }
            }
          }
        } else if (sub.keyword) {
          // Keyword subscription: RPC already confirmed match at meeting level
          // Highlight all agenda items that have embeddings (those are the ones matched)
          for (const decision of digest.key_decisions) {
            highlights.set(`decision:${decision.motion_id}`, {
              reason: `"${sub.keyword}" keyword`,
            });
          }
          for (const item of digest.controversial_items) {
            highlights.set(`controversial:${item.id}`, {
              reason: `"${sub.keyword}" keyword`,
            });
          }
        }
        break;
      }

      case "neighborhood": {
        // RPC already confirmed geo match exists; highlight items that have geo data
        for (const decision of digest.key_decisions) {
          const motion = motionMap.get(decision.motion_id);
          if (motion) {
            const ai = agendaById.get(motion.agenda_item_id);
            if (ai?.geo) {
              highlights.set(`decision:${decision.motion_id}`, {
                reason: "Near your address",
              });
            }
          }
        }
        for (const item of digest.controversial_items) {
          const ai = agendaById.get(item.id);
          if (ai?.geo) {
            highlights.set(`controversial:${item.id}`, {
              reason: "Near your address",
            });
          }
        }
        break;
      }
    }
  }

  return highlights;
}

interface PreMeetingItem {
  id: number;
  title: string;
  category?: string;
  plain_english_summary?: string;
  related_address?: string[];
  geo?: any;
  matter_id?: number;
  matters?: { id: number; category?: string };
}

interface MeetingInfo {
  id: number;
  title: string;
  meeting_date: string;
  type: string;
  summary?: string;
  has_agenda: boolean;
}

Deno.serve(async (req: Request) => {
  // Verify authorization
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json();
  const { meeting_id, mode = "digest" } = body;
  if (!meeting_id) {
    return new Response(JSON.stringify({ error: "meeting_id required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (mode !== "digest" && mode !== "pre_meeting") {
    return new Response(
      JSON.stringify({ error: "mode must be 'digest' or 'pre_meeting'" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (mode === "pre_meeting") {
    return handlePreMeeting(supabase, meeting_id);
  }

  return handleDigest(supabase, meeting_id);
});

// ─── Digest Mode ──────────────────────────────────────────────────

async function handleDigest(
  supabase: ReturnType<typeof createClient>,
  meeting_id: number,
): Promise<Response> {
  // 1. Build the digest -- returns null if meeting only has agenda
  const { data: digest, error: digestError } = await supabase.rpc(
    "build_meeting_digest",
    { target_meeting_id: meeting_id },
  );

  if (digestError) {
    console.error("Error building digest:", digestError);
    return new Response(
      JSON.stringify({ error: "Failed to build digest", details: digestError }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!digest) {
    return new Response(
      JSON.stringify({
        skipped: true,
        reason:
          "Meeting only has an agenda (no minutes or transcript). No digest sent.",
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  const digestPayload = digest as DigestPayload;

  // 2. Find all subscribers who should be notified
  const { data: subscribers, error: subError } = await supabase.rpc(
    "find_meeting_subscribers",
    { target_meeting_id: meeting_id },
  );

  if (subError) {
    console.error("Error finding subscribers:", subError);
    return new Response(
      JSON.stringify({
        error: "Failed to find subscribers",
        details: subError,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!subscribers || subscribers.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, reason: "No subscribers to notify." }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // 3. Deduplicate by email (a user might match multiple subscriptions)
  const emailMap = new Map<string, Subscriber[]>();
  for (const sub of subscribers as Subscriber[]) {
    const existing = emailMap.get(sub.notification_email) || [];
    existing.push(sub);
    emailMap.set(sub.notification_email, existing);
  }

  // 4. Query full subscription details for all matched subscription IDs
  const allSubIds = (subscribers as Subscriber[]).map((s) => s.subscription_id);
  const { data: subDetails } = await supabase
    .from("subscriptions")
    .select("id, type, matter_id, topic_id, person_id, neighborhood, keyword")
    .in("id", allSubIds);

  const subDetailMap = new Map<number, SubscriptionDetail>();
  for (const sd of subDetails || []) {
    subDetailMap.set(sd.id, sd);
  }

  // 5. Send emails and log alerts
  let sent = 0;
  let errors = 0;

  for (const [email, subs] of emailMap) {
    // Check dedup -- did we already send a digest for this meeting to this user?
    const { data: existingAlert } = await supabase
      .from("alert_log")
      .select("id")
      .eq("user_id", subs[0].user_id)
      .eq("meeting_id", meeting_id)
      .eq("alert_type", "digest")
      .eq("email_sent", true)
      .maybeSingle();

    if (existingAlert) {
      continue; // Already sent
    }

    // Get this subscriber's matched subscription details
    const subscriberSubDetails: SubscriptionDetail[] = subs
      .map((s) => subDetailMap.get(s.subscription_id))
      .filter((sd): sd is SubscriptionDetail => sd !== undefined);

    // Calculate highlighted items for this subscriber
    const highlights = await getHighlightedItems(
      supabase,
      digestPayload,
      meeting_id,
      subscriberSubDetails,
    );

    const html = buildDigestHtml(digestPayload, highlights);
    const subject = `What happened at Council: ${digestPayload.meeting.title}`;

    const { emailSent, errorMessage } = await sendEmail(email, subject, html);
    if (emailSent) sent++;
    else errors++;

    // Log the alert
    await supabase.from("alert_log").insert({
      user_id: subs[0].user_id,
      subscription_id: subs[0].subscription_id,
      meeting_id,
      alert_type: "digest",
      email_sent: emailSent,
      sent_at: emailSent ? new Date().toISOString() : null,
      error_message: errorMessage,
    });
  }

  return new Response(
    JSON.stringify({
      meeting_id,
      mode: "digest",
      subscribers_matched: emailMap.size,
      sent,
      errors,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

// ─── Pre-Meeting Mode ─────────────────────────────────────────────

async function handlePreMeeting(
  supabase: ReturnType<typeof createClient>,
  meeting_id: number,
): Promise<Response> {
  // 1. Get meeting data
  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("id, title, meeting_date, type, summary, has_agenda")
    .eq("id", meeting_id)
    .single();

  if (meetingError || !meeting) {
    return new Response(
      JSON.stringify({ error: "Meeting not found", details: meetingError }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const meetingInfo = meeting as MeetingInfo;

  // 2. Query agenda items for this meeting
  const { data: agendaItems } = await supabase
    .from("agenda_items")
    .select(
      "id, title, category, plain_english_summary, related_address, geo, matter_id, matters(id, category)",
    )
    .eq("meeting_id", meeting_id)
    .order("item_order");

  const allItems = (agendaItems || []) as PreMeetingItem[];

  // 3. Find subscribers via the same RPC
  const { data: subscribers, error: subError } = await supabase.rpc(
    "find_meeting_subscribers",
    { target_meeting_id: meeting_id },
  );

  if (subError) {
    console.error("Error finding subscribers:", subError);
    return new Response(
      JSON.stringify({
        error: "Failed to find subscribers",
        details: subError,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!subscribers || subscribers.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, reason: "No subscribers to notify." }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // 4. Deduplicate by email
  const emailMap = new Map<string, Subscriber[]>();
  for (const sub of subscribers as Subscriber[]) {
    const existing = emailMap.get(sub.notification_email) || [];
    existing.push(sub);
    emailMap.set(sub.notification_email, existing);
  }

  // 5. Query subscription details
  const allSubIds = (subscribers as Subscriber[]).map((s) => s.subscription_id);
  const { data: subDetails } = await supabase
    .from("subscriptions")
    .select("id, type, matter_id, topic_id, person_id, neighborhood, keyword")
    .in("id", allSubIds);

  const subDetailMap = new Map<number, SubscriptionDetail>();
  for (const sd of subDetails || []) {
    subDetailMap.set(sd.id, sd);
  }

  // Resolve topic names for all topic subscriptions
  const allTopicIds = (subDetails || [])
    .filter((s: any) => s.type === "topic" && s.topic_id)
    .map((s: any) => s.topic_id);
  const topicNames = new Map<number, string>();
  if (allTopicIds.length > 0) {
    const { data: topics } = await supabase
      .from("topics")
      .select("id, name")
      .in("id", allTopicIds);
    for (const t of topics || []) {
      topicNames.set(t.id, t.name);
    }
  }

  // 6. Send pre-meeting alerts
  let sent = 0;
  let errors = 0;

  for (const [email, subs] of emailMap) {
    // Check dedup
    const { data: existingAlert } = await supabase
      .from("alert_log")
      .select("id")
      .eq("user_id", subs[0].user_id)
      .eq("meeting_id", meeting_id)
      .eq("alert_type", "pre_meeting")
      .eq("email_sent", true)
      .maybeSingle();

    if (existingAlert) {
      continue;
    }

    // Get this subscriber's matched subscription details
    const subscriberSubDetails: SubscriptionDetail[] = subs
      .map((s) => subDetailMap.get(s.subscription_id))
      .filter((sd): sd is SubscriptionDetail => sd !== undefined);

    // Find which agenda items match this subscriber's subscriptions
    const matchedItems = getPreMeetingMatchedItems(
      allItems,
      subscriberSubDetails,
      topicNames,
    );

    // Build the pre-meeting email
    const html = buildPreMeetingHtml(
      meetingInfo,
      matchedItems,
      allItems,
      subscriberSubDetails,
      topicNames,
    );
    const meetingDate = new Date(meetingInfo.meeting_date).toLocaleDateString(
      "en-CA",
      { month: "long", day: "numeric" },
    );
    const subject = `Coming up: ${meetingInfo.title} \u2014 ${meetingDate}`;

    const { emailSent, errorMessage } = await sendEmail(email, subject, html);
    if (emailSent) sent++;
    else errors++;

    // Log the alert
    await supabase.from("alert_log").insert({
      user_id: subs[0].user_id,
      subscription_id: subs[0].subscription_id,
      meeting_id,
      alert_type: "pre_meeting",
      email_sent: emailSent,
      sent_at: emailSent ? new Date().toISOString() : null,
      error_message: errorMessage,
    });
  }

  return new Response(
    JSON.stringify({
      meeting_id,
      mode: "pre_meeting",
      subscribers_matched: emailMap.size,
      sent,
      errors,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

// ─── Email Sending ────────────────────────────────────────────────

async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<{ emailSent: boolean; errorMessage: string | null }> {
  if (!RESEND_API_KEY) {
    return { emailSent: false, errorMessage: "RESEND_API_KEY not configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });

    if (res.ok) {
      return { emailSent: true, errorMessage: null };
    }
    const errBody = await res.text();
    return {
      emailSent: false,
      errorMessage: `Resend API error: ${res.status} - ${errBody}`,
    };
  } catch (err: any) {
    return { emailSent: false, errorMessage: err.message };
  }
}

// ─── Pre-Meeting Item Matching ────────────────────────────────────

interface MatchedPreMeetingItem {
  item: PreMeetingItem;
  reasons: string[];
}

function getPreMeetingMatchedItems(
  agendaItems: PreMeetingItem[],
  subscriberSubs: SubscriptionDetail[],
  topicNames: Map<number, string>,
): MatchedPreMeetingItem[] {
  const matchMap = new Map<number, { item: PreMeetingItem; reasons: Set<string> }>();

  for (const sub of subscriberSubs) {
    switch (sub.type) {
      case "matter": {
        for (const item of agendaItems) {
          if (item.matter_id === sub.matter_id) {
            const entry = matchMap.get(item.id) || {
              item,
              reasons: new Set<string>(),
            };
            entry.reasons.add(`Because you follow this matter`);
            matchMap.set(item.id, entry);
          }
        }
        break;
      }

      case "topic": {
        if (sub.topic_id) {
          const topicName = topicNames.get(sub.topic_id);
          if (topicName) {
            for (const item of agendaItems) {
              if (item.matters?.category === topicName) {
                const entry = matchMap.get(item.id) || {
                  item,
                  reasons: new Set<string>(),
                };
                entry.reasons.add(`Because you follow ${topicName}`);
                matchMap.set(item.id, entry);
              }
            }
          }
        } else if (sub.keyword) {
          // Keyword match confirmed by RPC -- highlight all items
          for (const item of agendaItems) {
            const entry = matchMap.get(item.id) || {
              item,
              reasons: new Set<string>(),
            };
            entry.reasons.add(`Matches your "${sub.keyword}" keyword`);
            matchMap.set(item.id, entry);
          }
        }
        break;
      }

      case "neighborhood": {
        for (const item of agendaItems) {
          if (item.geo) {
            const entry = matchMap.get(item.id) || {
              item,
              reasons: new Set<string>(),
            };
            entry.reasons.add("Near your address");
            matchMap.set(item.id, entry);
          }
        }
        break;
      }

      // digest and person subscriptions don't have item-level matching for pre-meeting
      // (person subs match via motions which don't exist pre-meeting)
    }
  }

  return [...matchMap.values()].map((entry) => ({
    item: entry.item,
    reasons: [...entry.reasons],
  }));
}

// ─── Pre-Meeting HTML Builder ─────────────────────────────────────

function buildPreMeetingHtml(
  meeting: MeetingInfo,
  matchedItems: MatchedPreMeetingItem[],
  allItems: PreMeetingItem[],
  subscriberSubs: SubscriptionDetail[],
  _topicNames: Map<number, string>,
): string {
  const meetingUrl = `${BASE_URL}/meetings/${meeting.id}`;
  const meetingDate = new Date(meeting.meeting_date).toLocaleDateString(
    "en-CA",
    { weekday: "long", year: "numeric", month: "long", day: "numeric" },
  );
  const meetingTime = new Date(meeting.meeting_date).toLocaleTimeString(
    "en-CA",
    { hour: "numeric", minute: "2-digit" },
  );

  const hasSpecificMatches = matchedItems.length > 0;
  const isDigestOnly = subscriberSubs.every((s) => s.type === "digest");

  // Build matched items section
  let matchedItemsHtml = "";
  if (hasSpecificMatches) {
    matchedItemsHtml = `
    <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:0.1em;color:#71717a;margin:24px 0 12px;">Agenda items that might interest you</h3>
    ${matchedItems
      .map((m) => {
        const reasonBadges = m.reasons
          .map(
            (r) =>
              `<span style="display:inline-block;background:#dbeafe;color:#1d4ed8;font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;margin-left:4px;margin-top:4px;">${r}</span>`,
          )
          .join("");
        const summary = m.item.plain_english_summary
          ? `<br><span style="color:#52525b;font-size:13px;">${m.item.plain_english_summary}</span>`
          : "";
        const address =
          m.item.related_address && m.item.related_address.length > 0
            ? `<br><span style="color:#6b7280;font-size:12px;">&#128205; ${m.item.related_address.join(", ")}</span>`
            : "";
        return `
      <div style="padding:12px;background:#f9fafb;border-radius:8px;margin-bottom:8px;border-left:3px solid #2563eb;">
        <strong style="color:#18181b;">${m.item.title}</strong>
        <div style="margin-top:4px;">${reasonBadges}</div>
        ${summary}
        ${address}
      </div>`;
      })
      .join("")}`;
  }

  // If user only has digest subscription (no specific matches), show full agenda
  let fullAgendaHtml = "";
  if (isDigestOnly && !hasSpecificMatches) {
    fullAgendaHtml = `
    <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:0.1em;color:#71717a;margin:24px 0 12px;">On the agenda</h3>
    ${allItems
      .map((item) => {
        const summary = item.plain_english_summary
          ? `<br><span style="color:#52525b;font-size:13px;">${item.plain_english_summary}</span>`
          : "";
        return `
      <div style="padding:8px 0;border-bottom:1px solid #f4f4f5;">
        <strong style="color:#18181b;font-size:14px;">${item.title}</strong>
        ${summary}
      </div>`;
      })
      .join("")}`;
  }

  // Intro text varies based on whether there are specific matches
  const introText = hasSpecificMatches
    ? `Your council is meeting on ${meetingDate} and some items on the agenda might interest you.`
    : `Your council is meeting soon. Here's what's on the agenda.`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#ffffff;">
  <div style="text-align:center;margin-bottom:24px;">
    <h1 style="font-size:20px;margin:0;">
      <span style="color:#2563eb;">ViewRoyal</span><span style="color:#18181b;">.ai</span>
    </h1>
    <p style="color:#71717a;font-size:13px;margin:4px 0 0;">Heads up &mdash; Council is meeting soon</p>
  </div>

  <div style="background:#f4f4f5;border-radius:12px;padding:20px;margin-bottom:24px;">
    <h2 style="margin:0 0 4px;font-size:18px;color:#18181b;">${meeting.title}</h2>
    <p style="color:#52525b;font-size:14px;margin:0;">${meetingDate} &bull; ${meetingTime} &bull; ${meeting.type || "Council Meeting"}</p>
  </div>

  <p style="color:#3f3f46;font-size:14px;line-height:1.6;margin-bottom:24px;">${introText}</p>

  ${matchedItemsHtml}

  ${fullAgendaHtml}

  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-top:24px;">
    <h3 style="font-size:14px;color:#166534;margin:0 0 12px;">Want to attend or watch?</h3>
    <table style="width:100%;font-size:13px;color:#3f3f46;">
      <tr>
        <td style="padding:4px 8px 4px 0;vertical-align:top;font-weight:600;white-space:nowrap;">When</td>
        <td style="padding:4px 0;">${meetingDate} at ${meetingTime}</td>
      </tr>
      <tr>
        <td style="padding:4px 8px 4px 0;vertical-align:top;font-weight:600;white-space:nowrap;">Where</td>
        <td style="padding:4px 0;">Council Chambers, View Royal Town Hall, 45 View Royal Ave</td>
      </tr>
      <tr>
        <td style="padding:4px 8px 4px 0;vertical-align:top;font-weight:600;white-space:nowrap;">Online</td>
        <td style="padding:4px 0;">Meetings are live-streamed on the <a href="https://www.youtube.com/@TownofViewRoyal" style="color:#2563eb;">Town's YouTube channel</a></td>
      </tr>
      <tr>
        <td style="padding:4px 8px 4px 0;vertical-align:top;font-weight:600;white-space:nowrap;">Comment</td>
        <td style="padding:4px 0;">To speak during public comment, contact the municipal clerk at <a href="mailto:admin@viewroyal.ca" style="color:#2563eb;">admin@viewroyal.ca</a></td>
      </tr>
    </table>
  </div>

  <div style="text-align:center;margin-top:32px;">
    <a href="${meetingUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">
      View the Full Agenda
    </a>
  </div>

  <hr style="border:none;border-top:1px solid #e4e4e7;margin:32px 0 16px;">
  <p style="text-align:center;font-size:11px;color:#a1a1aa;">
    You're receiving this because you subscribed to council alerts on ViewRoyal.ai.<br>
    <a href="${BASE_URL}/settings" style="color:#2563eb;">Manage your subscriptions</a>
  </p>
</body>
</html>`;
}

function buildDigestHtml(
  digest: DigestPayload,
  highlights: Map<string, HighlightInfo>,
): string {
  const meetingUrl = `${BASE_URL}/meetings/${digest.meeting.id}`;
  const meetingDate = new Date(digest.meeting.meeting_date).toLocaleDateString(
    "en-CA",
    { weekday: "long", year: "numeric", month: "long", day: "numeric" },
  );

  // Build the "Items you follow" summary section if there are highlights
  let followingSummaryHtml = "";
  if (highlights.size > 0) {
    const uniqueReasons = [...new Set([...highlights.values()].map((h) => h.reason))];
    const reasonListItems = uniqueReasons
      .map((r) => `<li>${r}</li>`)
      .join("");
    followingSummaryHtml = `
  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;margin-bottom:16px;">
    <strong style="color:#1d4ed8;font-size:13px;">Items you follow appeared in this meeting:</strong>
    <ul style="margin:8px 0 0;padding-left:16px;color:#1e40af;font-size:13px;">
      ${reasonListItems}
    </ul>
  </div>`;
  }

  const followingBadge = `<span style="display:inline-block;background:#dbeafe;color:#1d4ed8;font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;margin-left:8px;">Following</span>`;

  const decisionsHtml = digest.key_decisions
    .map((d) => {
      const icon = d.result === "CARRIED" ? "&#9989;" : "&#10060;";
      const divided = d.is_divided
        ? ` <span style="color:#dc2626;font-size:12px;">(Divided: ${d.yes_votes}-${d.no_votes})</span>`
        : "";
      const location = d.neighborhood
        ? `<br><span style="color:#6b7280;font-size:12px;">&#128205; ${d.neighborhood}</span>`
        : "";
      const highlight = highlights.has(`decision:${d.motion_id}`)
        ? followingBadge
        : "";
      return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f4f4f5;">
            ${icon} <strong>${d.agenda_item_title}</strong>${highlight}${divided}
            <br><span style="color:#52525b;font-size:13px;">${d.motion_text || ""}</span>
            ${location}
          </td>
        </tr>`;
    })
    .join("");

  const controversialHtml =
    digest.controversial_items.length > 0
      ? `
    <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:0.1em;color:#71717a;margin:24px 0 12px;">Where Council Disagreed</h3>
    ${digest.controversial_items
      .map((item) => {
        const highlight = highlights.has(`controversial:${item.id}`)
          ? followingBadge
          : "";
        return `
      <div style="padding:12px;background:#fef2f2;border-radius:8px;margin-bottom:8px;">
        <strong style="color:#991b1b;">${item.title}</strong>${highlight}
        <br><span style="color:#7f1d1d;font-size:13px;">${item.summary || item.debate_summary || ""}</span>
      </div>`;
      })
      .join("")}`
      : "";

  const attendanceHtml = digest.attendance
    .map((a) => {
      const emoji =
        a.mode === "In Person"
          ? "&#128100;"
          : a.mode === "Remote"
            ? "&#128187;"
            : a.mode === "Absent" || a.mode === "Regrets"
              ? "&#10060;"
              : "&#10067;";
      return `${emoji} ${a.person_name}`;
    })
    .join(" &nbsp;&bull;&nbsp; ");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#ffffff;">
  <div style="text-align:center;margin-bottom:24px;">
    <h1 style="font-size:20px;margin:0;">
      <span style="color:#2563eb;">ViewRoyal</span><span style="color:#18181b;">.ai</span>
    </h1>
    <p style="color:#71717a;font-size:13px;margin:4px 0 0;">What happened at Council</p>
  </div>

  <div style="background:#f4f4f5;border-radius:12px;padding:20px;margin-bottom:24px;">
    <h2 style="margin:0 0 4px;font-size:18px;color:#18181b;">${digest.meeting.title}</h2>
    <p style="color:#52525b;font-size:14px;margin:0;">${meetingDate} &bull; ${digest.meeting.type || "Council Meeting"}</p>
  </div>

  <p style="color:#3f3f46;font-size:14px;line-height:1.6;margin-bottom:24px;">Here's a quick rundown of what your council discussed on ${meetingDate}.</p>

  ${followingSummaryHtml}

  ${digest.meeting.summary ? `<p style="color:#3f3f46;font-size:14px;line-height:1.6;margin-bottom:24px;">${digest.meeting.summary}</p>` : ""}

  ${
    digest.key_decisions.length > 0
      ? `
  <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:0.1em;color:#71717a;margin:0 0 12px;">What Council Decided</h3>
  <table style="width:100%;border-collapse:collapse;">${decisionsHtml}</table>`
      : ""
  }

  ${controversialHtml}

  ${
    attendanceHtml
      ? `
  <div style="margin-top:24px;padding:12px;background:#f9fafb;border-radius:8px;">
    <h4 style="font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#a1a1aa;margin:0 0 8px;">Who was there</h4>
    <p style="font-size:13px;color:#52525b;margin:0;">${attendanceHtml}</p>
  </div>`
      : ""
  }

  <div style="text-align:center;margin-top:32px;">
    <a href="${meetingUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">
      View Full Meeting Details
    </a>
  </div>

  <hr style="border:none;border-top:1px solid #e4e4e7;margin:32px 0 16px;">
  <p style="text-align:center;font-size:11px;color:#a1a1aa;">
    You're receiving this because you subscribed to council alerts on ViewRoyal.ai.<br>
    <a href="${BASE_URL}/settings" style="color:#2563eb;">Manage your subscriptions</a>
  </p>
</body>
</html>`;
}
