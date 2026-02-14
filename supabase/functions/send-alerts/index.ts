/**
 * Supabase Edge Function: send-alerts
 *
 * Called after pipeline ingestion completes for a meeting.
 * Matches meeting content against user subscriptions, builds digests,
 * and sends email alerts via Resend.
 *
 * POST /send-alerts
 * Body: { meeting_id: number }
 * Headers: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
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

Deno.serve(async (req: Request) => {
  // Verify authorization
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { meeting_id } = await req.json();
  if (!meeting_id) {
    return new Response(JSON.stringify({ error: "meeting_id required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Build the digest — returns null if meeting only has agenda
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
      JSON.stringify({ error: "Failed to find subscribers", details: subError }),
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

  // 4. Send emails and log alerts
  let sent = 0;
  let errors = 0;

  for (const [email, subs] of emailMap) {
    // Check dedup — did we already send a digest for this meeting to this user?
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

    const html = buildDigestHtml(digestPayload, subs);
    const subject = `Council Update: ${digestPayload.meeting.title}`;

    let emailSent = false;
    let errorMessage: string | null = null;

    if (RESEND_API_KEY) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: email,
            subject,
            html,
          }),
        });

        if (res.ok) {
          emailSent = true;
          sent++;
        } else {
          const errBody = await res.text();
          errorMessage = `Resend API error: ${res.status} - ${errBody}`;
          errors++;
        }
      } catch (err: any) {
        errorMessage = err.message;
        errors++;
      }
    } else {
      errorMessage = "RESEND_API_KEY not configured";
      errors++;
    }

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
      subscribers_matched: emailMap.size,
      sent,
      errors,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});

function buildDigestHtml(
  digest: DigestPayload,
  subs: Subscriber[],
): string {
  const meetingUrl = `https://viewroyal.ai/meetings/${digest.meeting.id}`;
  const meetingDate = new Date(digest.meeting.meeting_date).toLocaleDateString(
    "en-CA",
    { weekday: "long", year: "numeric", month: "long", day: "numeric" },
  );

  const decisionsHtml = digest.key_decisions
    .map((d) => {
      const icon = d.result === "CARRIED" ? "&#9989;" : "&#10060;";
      const divided = d.is_divided
        ? ` <span style="color:#dc2626;font-size:12px;">(Divided: ${d.yes_votes}-${d.no_votes})</span>`
        : "";
      const location = d.neighborhood
        ? `<br><span style="color:#6b7280;font-size:12px;">&#128205; ${d.neighborhood}</span>`
        : "";
      return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f4f4f5;">
            ${icon} <strong>${d.agenda_item_title}</strong>${divided}
            <br><span style="color:#52525b;font-size:13px;">${d.motion_text || ""}</span>
            ${location}
          </td>
        </tr>`;
    })
    .join("");

  const controversialHtml =
    digest.controversial_items.length > 0
      ? `
    <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:0.1em;color:#71717a;margin:24px 0 12px;">Controversial Items</h3>
    ${digest.controversial_items
      .map(
        (item) => `
      <div style="padding:12px;background:#fef2f2;border-radius:8px;margin-bottom:8px;">
        <strong style="color:#991b1b;">${item.title}</strong>
        <br><span style="color:#7f1d1d;font-size:13px;">${item.summary || item.debate_summary || ""}</span>
      </div>`,
      )
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
    <p style="color:#71717a;font-size:13px;margin:4px 0 0;">Council Meeting Digest</p>
  </div>

  <div style="background:#f4f4f5;border-radius:12px;padding:20px;margin-bottom:24px;">
    <h2 style="margin:0 0 4px;font-size:18px;color:#18181b;">${digest.meeting.title}</h2>
    <p style="color:#52525b;font-size:14px;margin:0;">${meetingDate} &bull; ${digest.meeting.type || "Council Meeting"}</p>
  </div>

  ${digest.meeting.summary ? `<p style="color:#3f3f46;font-size:14px;line-height:1.6;margin-bottom:24px;">${digest.meeting.summary}</p>` : ""}

  ${
    digest.key_decisions.length > 0
      ? `
  <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:0.1em;color:#71717a;margin:0 0 12px;">Key Decisions</h3>
  <table style="width:100%;border-collapse:collapse;">${decisionsHtml}</table>`
      : ""
  }

  ${controversialHtml}

  ${
    attendanceHtml
      ? `
  <div style="margin-top:24px;padding:12px;background:#f9fafb;border-radius:8px;">
    <h4 style="font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#a1a1aa;margin:0 0 8px;">Attendance</h4>
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
    <a href="https://viewroyal.ai/settings" style="color:#2563eb;">Manage your subscriptions</a>
  </p>
</body>
</html>`;
}
