/**
 * Motion serializers.
 *
 * Allowlist pattern -- every field is explicitly listed.
 */

/**
 * Serialize a single roll-call vote record.
 */
export function serializeVoteSummary(vote: any) {
  return {
    person_slug: vote.person?.slug ?? null,
    person_name: vote.person?.name ?? null,
    vote_value: vote.vote ?? null,
  };
}

/**
 * Serialize a motion for list views.
 */
export function serializeMotionSummary(row: any) {
  const text =
    row.plain_english_summary != null
      ? row.plain_english_summary.length > 200
        ? row.plain_english_summary.slice(0, 200) + "..."
        : row.plain_english_summary
      : row.text_content != null
        ? row.text_content.length > 200
          ? row.text_content.slice(0, 200) + "..."
          : row.text_content
        : null;

  return {
    slug: row.slug,
    text,
    result: row.result ?? null,
    mover_name: row.mover_person?.name ?? null,
    seconder_name: row.seconder_person?.name ?? null,
    meeting_slug: row.meetings?.slug ?? null,
    meeting_date: row.meetings?.meeting_date ?? null,
  };
}

/**
 * Serialize a motion for the detail view, including full text and votes.
 */
export function serializeMotionDetail(
  row: any,
  related: { votes?: any[] },
) {
  return {
    slug: row.slug,
    text:
      row.plain_english_summary != null
        ? row.plain_english_summary.length > 200
          ? row.plain_english_summary.slice(0, 200) + "..."
          : row.plain_english_summary
        : row.text_content != null
          ? row.text_content.length > 200
            ? row.text_content.slice(0, 200) + "..."
            : row.text_content
          : null,
    result: row.result ?? null,
    mover_name: row.mover_person?.name ?? null,
    seconder_name: row.seconder_person?.name ?? null,
    meeting_slug: row.meetings?.slug ?? null,
    meeting_date: row.meetings?.meeting_date ?? null,
    text_content: row.text_content ?? null,
    plain_english_summary: row.plain_english_summary ?? null,
    agenda_item_slug: row.agenda_items?.slug ?? null,
    agenda_item_title: row.agenda_items?.title ?? null,
    votes: (related.votes ?? []).map(serializeVoteSummary),
  };
}
