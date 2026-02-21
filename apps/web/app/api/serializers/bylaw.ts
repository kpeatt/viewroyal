/**
 * Bylaw serializers.
 *
 * Allowlist pattern -- every field is explicitly listed.
 */

/**
 * Serialize a bylaw for list views.
 */
export function serializeBylawSummary(row: any) {
  return {
    slug: row.slug,
    title: row.title,
    bylaw_number: row.bylaw_number ?? null,
    status: row.status,
    category: row.category ?? null,
    year: row.year ?? null,
  };
}

/**
 * Serialize a bylaw for the detail view, including linked matters.
 */
export function serializeBylawDetail(
  row: any,
  related: { matters?: any[] },
) {
  return {
    slug: row.slug,
    title: row.title,
    bylaw_number: row.bylaw_number ?? null,
    status: row.status,
    category: row.category ?? null,
    year: row.year ?? null,
    description: row.description ?? null,
    plain_english_summary: row.plain_english_summary ?? null,
    matters: (related.matters ?? []).map((m: any) => ({
      slug: m.slug,
      title: m.title,
      status: m.status,
    })),
  };
}
