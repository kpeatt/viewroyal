export interface AttendanceInfo {
  venue: string;
  address: string;
  mapsUrl: string;
  watchLink?: string;
  watchLabel?: string;
  publicInputProcess: string;
  startTime?: string;
  specialInstructions?: string;
}

/**
 * Merge municipality-level attendance defaults with per-meeting overrides.
 * Returns null if the municipality has no attendance_info configured.
 */
export function getAttendanceInfo(
  municipalityMeta: any,
  meetingMeta: any,
  meetingType?: string,
): AttendanceInfo | null {
  const defaults = municipalityMeta?.attendance_info;
  if (!defaults) return null;

  const overrides = meetingMeta?.attendance_info;
  const isPublicHearing = meetingType?.toLowerCase().includes("public hearing");

  const publicInputProcess = isPublicHearing
    ? (overrides?.public_hearing_process ?? defaults.public_hearing_process ?? defaults.public_input_process ?? "")
    : (overrides?.public_input_process ?? defaults.public_input_process ?? "");

  return {
    venue: overrides?.venue ?? defaults.venue ?? "",
    address: overrides?.address ?? defaults.address ?? "",
    mapsUrl: overrides?.maps_url ?? defaults.maps_url ?? "",
    watchLink: overrides?.watch_link ?? overrides?.zoom_link ?? defaults.watch_link,
    watchLabel: overrides?.watch_label ?? defaults.watch_label,
    publicInputProcess,
    startTime: overrides?.start_time ?? defaults.default_start_time,
    specialInstructions: overrides?.special_instructions,
  };
}

// ─── SQL Seed ───────────────────────────────────────────────────────────────
// Run once to seed View Royal attendance defaults:
//
// UPDATE municipalities SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{attendance_info}', '{
//   "venue": "Council Chambers, View Royal Town Hall",
//   "address": "45 View Royal Ave, Victoria, BC V9B 1A6",
//   "maps_url": "https://maps.google.com/?q=View+Royal+Town+Hall+45+View+Royal+Ave+Victoria+BC",
//   "watch_link": "https://www.youtube.com/@TownofViewRoyal",
//   "watch_label": "Town YouTube channel",
//   "public_input_process": "To speak during public comment, contact the municipal clerk at admin@viewroyal.ca or call 250-479-6800.",
//   "public_hearing_process": "Written submissions accepted until 4pm on the hearing date. Speakers may register at the meeting or contact admin@viewroyal.ca.",
//   "default_start_time": "7:00 PM"
// }'::jsonb) WHERE slug = 'view-royal';
