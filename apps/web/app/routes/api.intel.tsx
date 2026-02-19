import type { Route } from "./+types/api.intel";
import { GoogleGenAI } from "@google/genai";
import { isAuthenticated } from "../lib/auth.server";
import { getSupabaseAdminClient } from "../lib/supabase.server";

export async function action({ params, request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!(await isAuthenticated(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdminClient();

  const { id: idStr } = params;
  const id = parseInt(idStr!, 10);
  console.log(`[Intelligence API] Starting for item ${id}...`);
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("[Intelligence API] Error: GEMINI_API_KEY is not set.");
    return { error: "GEMINI_API_KEY not configured on server" };
  }

  try {
    // 1. Fetch Agenda Item and its Meeting ID
    console.log(`[Intelligence API] Fetching item data for ID ${id}...`);
    const { data: item, error: itemError } = await supabaseAdmin
      .from("agenda_items")
      .select("id, title, meeting_id, meta")
      .eq("id", id)
      .single();

    if (itemError || !item) {
        console.error(`[Intelligence API] Item error: ${itemError?.message}`);
        throw new Error(`Agenda item ${id} not found`);
    }

    console.log(`[Intelligence API] Current meta for item ${id}:`, JSON.stringify(item.meta));

    // 2. Fetch Speaker Aliases to resolve names
    const { data: aliases } = await supabaseAdmin
      .from("meeting_speaker_aliases")
      .select("speaker_label, person:people(name)")
      .eq("meeting_id", item.meeting_id);

    const aliasMap: Record<string, string> = {};
    (aliases || []).forEach((a: any) => {
      if (a.person?.name) {
        aliasMap[a.speaker_label] = a.person.name;
        aliasMap[a.speaker_label.toUpperCase()] = a.person.name;
      }
    });

    // 3. Fetch Transcript Segments
    console.log(`[Intelligence API] Fetching transcript segments...`);
    const { data: segments, error: segError } = await supabaseAdmin
      .from("transcript_segments")
      .select("speaker_name, text_content")
      .eq("agenda_item_id", id)
      .order("start_time", { ascending: true });

    if (segError) throw segError;
    if (!segments || segments.length === 0) {
      console.log(`[Intelligence API] No segments found for item ${id}`);
      return { error: "No transcript segments linked to this item yet." };
    }

    console.log(`[Intelligence API] Found ${segments.length} segments. Preparing Gemini prompt...`);

    // 4. Construct Transcript Text
    const transcriptText = segments
      .map((s) => {
        const name = aliasMap[s.speaker_name || ""] || s.speaker_name || "Unknown";
        return `${name}: ${s.text_content}`;
      })
      .join("\n");

    // 5. Call Gemini
    console.log(`[Intelligence API] Calling Gemini 3 Flash...`);
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
You are a City Council Intelligence Analyst.
Analyze the following transcript segment from a municipal meeting for the item: "${item.title}".

**GOAL**: Extract deep insights into the discussion, PRIORITIZING the contributions, concerns, and arguments made by Council Members (Mayor and Councillors).

**TRANSCRIPT**:
${transcriptText.slice(0, 50000)}

**INSTRUCTIONS**:
Return a JSON object with the following fields:
1. "detailed_analysis": A comprehensive 2-3 paragraph narrative. Focus on the Council's reaction to the proposal, the core of their debate, and how they reached their decision.
2. "arguments": A list of objects with "side" ('Pro' or 'Con'), "point" (string), and "speaker" (string). 
   - FOCUS ON COUNCIL MEMBERS. Only include staff/applicant points if they are critical context for a Council member's objection or support.
   - "Pro" should reflect reasons for support expressed by Council.
   - "Con" should reflect specific concerns, skepticism, or objections raised by Council.
3. "questions": A list of objects with "question" (string), "asked_by" (string), "answered_by" (string), and "answer" (string).
   - Capture the specific "grilling" or clarification questions asked by Council to Staff or Applicants.
4. "sentiment_score": A float from -1.0 (Critical/Hostile) to 1.0 (Supportive/Favorable). This score must reflect the COUNCIL'S overall mood toward the item.

Example structure:
{
  "detailed_analysis": "...",
  "arguments": [{"side": "Pro", "point": "...", "speaker": "..."}],
  "questions": [{"question": "...", "asked_by": "...", "answered_by": "...", "answer": "..."}],
  "sentiment_score": 0.5
}
`;

    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });
    const intelData = JSON.parse(result.text ?? "{}");
    console.log(`[Intelligence API] Gemini response received.`);

    // 6. Update Database
    console.log(`[Intelligence API] Updating database...`);
    const newMeta = {
      ...(item.meta || {}),
      intelligence: intelData,
    };

    const { error: updateError } = await supabaseAdmin
      .from("agenda_items")
      .update({ meta: newMeta })
      .eq("id", id);

    if (updateError) {
        console.error(`[Intelligence API] Update error: ${updateError.message}`);
        throw updateError;
    }

    console.log(`[Intelligence API] Success!`);
    return Response.json({ success: true, intelligence: intelData });

  } catch (error: any) {
    console.error("[Intelligence API] Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
export default function Component() { return null; }
