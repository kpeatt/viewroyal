/**
 * Meeting serializers.
 *
 * Allowlist pattern: explicitly construct new objects with only public fields.
 * Never spread `...row`.  All fields use snake_case.  Null fields are always
 * included (never omitted).
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function serializeAgendaItemSummary(item: any) {
  return {
    slug: item.slug ?? null,
    title: item.title ?? null,
    item_number: item.item_order ?? null,
    type: item.category ?? null,
  };
}

export function serializeMotionSummary(motion: any) {
  const text =
    motion.plain_english_summary ??
    (motion.text_content
      ? motion.text_content.length > 200
        ? motion.text_content.slice(0, 200) + "..."
        : motion.text_content
      : null);

  return {
    slug: motion.slug ?? null,
    text,
    result: motion.result ?? null,
    mover_name: motion.mover ?? null,
    seconder_name: motion.seconder ?? null,
  };
}

export function serializeAttendanceSummary(record: any) {
  return {
    person_slug: record.person?.slug ?? null,
    person_name: record.person?.name ?? null,
    role: record.role ?? null,
    present: record.attendance_mode
      ? record.attendance_mode !== "Absent" &&
        record.attendance_mode !== "Regrets"
      : null,
  };
}

// ---------------------------------------------------------------------------
// Summary (list view)
// ---------------------------------------------------------------------------

export function serializeMeetingSummary(row: any) {
  return {
    slug: row.slug ?? null,
    title: row.title ?? null,
    date: row.meeting_date ?? null,
    type: row.type ?? null,
    has_agenda: row.has_agenda ?? false,
    has_minutes: row.has_minutes ?? false,
    has_transcript: row.has_transcript ?? false,
    organization: row.organization?.name ?? null,
    summary: row.summary ?? null,
  };
}

// ---------------------------------------------------------------------------
// Detail (single meeting)
// ---------------------------------------------------------------------------

export function serializeMeetingDetail(
  row: any,
  related: {
    agendaItems?: any[];
    motions?: any[];
    attendance?: any[];
  },
) {
  return {
    // Summary fields
    slug: row.slug ?? null,
    title: row.title ?? null,
    date: row.meeting_date ?? null,
    type: row.type ?? null,
    has_agenda: row.has_agenda ?? false,
    has_minutes: row.has_minutes ?? false,
    has_transcript: row.has_transcript ?? false,
    organization: row.organization?.name ?? null,
    summary: row.summary ?? null,

    // Detail-only fields
    video_url: row.video_url ?? null,
    minutes_url: row.minutes_url ?? null,
    agenda_url: row.agenda_url ?? null,
    video_duration_seconds: row.video_duration_seconds ?? null,
    chair: row.chair
      ? { slug: row.chair.slug ?? null, name: row.chair.name ?? null }
      : null,

    // Related data (compact inline summaries)
    agenda_items: (related.agendaItems ?? []).map(serializeAgendaItemSummary),
    motions: (related.motions ?? []).map(serializeMotionSummary),
    attendance: (related.attendance ?? []).map(serializeAttendanceSummary),
  };
}
