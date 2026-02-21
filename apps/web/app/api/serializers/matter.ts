/**
 * Matter serializers.
 *
 * Allowlist pattern -- every field is explicitly listed, never spread from the
 * DB row.  Internal fields (created_at, municipality_id, meta, etc.) are
 * stripped and never reach the API consumer.
 */

/**
 * Serialize a matter for list views.
 */
export function serializeMatterSummary(row: any) {
  return {
    slug: row.slug,
    title: row.title,
    status: row.status,
    category: row.category ?? null,
    description:
      row.description != null
        ? row.description.length > 200
          ? row.description.slice(0, 200) + "..."
          : row.description
        : null,
    first_seen: row.first_seen ?? null,
    last_seen: row.last_seen ?? null,
  };
}

/**
 * Serialize a single agenda-item entry for the matter timeline.
 */
export function serializeMatterTimelineItem(item: any) {
  return {
    slug: item.slug,
    title: item.title,
    meeting_slug: item.meetings?.slug ?? null,
    meeting_date: item.meetings?.meeting_date ?? null,
    item_number: item.item_order ?? null,
  };
}

/**
 * Serialize a matter for the detail view, including related agenda items and
 * motions.
 */
export function serializeMatterDetail(
  row: any,
  related: { agendaItems?: any[]; motions?: any[] },
) {
  return {
    slug: row.slug,
    title: row.title,
    status: row.status,
    category: row.category ?? null,
    description: row.description ?? null,
    first_seen: row.first_seen ?? null,
    last_seen: row.last_seen ?? null,
    plain_english_summary: row.plain_english_summary ?? null,
    agenda_items: (related.agendaItems ?? []).map(serializeMatterTimelineItem),
    motions: (related.motions ?? []).map((m: any) => ({
      slug: m.slug,
      text:
        m.plain_english_summary != null
          ? m.plain_english_summary.length > 200
            ? m.plain_english_summary.slice(0, 200) + "..."
            : m.plain_english_summary
          : m.text_content != null
            ? m.text_content.length > 200
              ? m.text_content.slice(0, 200) + "..."
              : m.text_content
            : null,
      result: m.result ?? null,
      meeting_date: m.meetings?.meeting_date ?? null,
    })),
  };
}
