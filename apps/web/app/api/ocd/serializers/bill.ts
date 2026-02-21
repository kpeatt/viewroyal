/**
 * OCD Bill serializer.
 *
 * Maps matter rows to OCD Bill objects.  Follows the allowlist pattern:
 * explicitly construct new objects with only public fields.  Never spread
 * `...row`.  All OCD spec fields are present (null when empty).
 *
 * Bills are complex -- they include actions derived from the agenda item
 * timeline (every time a matter appeared on an agenda) and sponsors derived
 * from motion movers (deduplicated by person name).
 */

/**
 * Serialize a matter row for list views (lightweight, no nested data).
 *
 * @param matter - Row from the matters table
 * @param ocdId - Pre-computed OCD ID for this bill
 * @param organizationOcdId - OCD ID for the Council organization
 */
export function serializeBillSummary(
  matter: any,
  ocdId: string,
  organizationOcdId: string,
) {
  return {
    id: ocdId,
    session: matter.first_seen
      ? new Date(matter.first_seen).getFullYear().toString()
      : null,
    name: matter.identifier ?? null,
    title: matter.title ?? null,
    type: [matter.category?.toLowerCase() ?? "resolution"],
    subject: matter.category ? [matter.category] : ([] as string[]),
    classification: [matter.category?.toLowerCase() ?? "resolution"],
    organization_id: organizationOcdId,
    from_organization_id: null as string | null,
    chamber: null as string | null,
    extras: {},
    created_at: matter.created_at ?? null,
    updated_at: matter.created_at ?? null,
    sources: [] as any[],
  };
}

/**
 * Serialize a matter row for detail views with actions and sponsors.
 *
 * @param matter - Row from the matters table
 * @param ocdId - Pre-computed OCD ID for this bill
 * @param organizationOcdId - OCD ID for the Council organization
 * @param related - Related data: agenda items (with meeting dates), motions, mover OCD IDs
 */
export function serializeBillDetail(
  matter: any,
  ocdId: string,
  organizationOcdId: string,
  related: {
    agendaItems: any[];
    motions: any[];
    moverOcdIds: Map<number, string>;
  },
) {
  // Build summaries from matter description
  const summaries: any[] = matter.description
    ? [{ note: "Description", text: matter.description }]
    : [];

  // Build sponsors from motions that have movers (deduplicate by person name)
  const seenMovers = new Set<string>();
  const sponsors: any[] = [];
  for (const motion of related.motions ?? []) {
    if (motion.mover && motion.mover_person_id && !seenMovers.has(motion.mover)) {
      seenMovers.add(motion.mover);
      sponsors.push({
        entity_type: "person",
        name: motion.mover,
        entity_id: related.moverOcdIds.get(motion.mover_person_id) ?? null,
        classification: "mover",
        primary: true,
      });
    }
  }

  // Build actions from agenda item appearances (full history)
  // Sort by meeting date ascending for chronological order
  const sortedItems = [...(related.agendaItems ?? [])].sort((a: any, b: any) => {
    const dateA = a.meeting?.meeting_date ?? "";
    const dateB = b.meeting?.meeting_date ?? "";
    return dateA.localeCompare(dateB);
  });

  const actions = sortedItems.map((item: any, index: number) => ({
    organization_id: organizationOcdId,
    description: item.title ?? "Discussion",
    date: item.meeting?.meeting_date ?? null,
    classification: [] as string[],
    order: index + 1,
    extras: {},
  }));

  // Build documents from matter.document_url
  const documents: any[] = matter.document_url
    ? [
        {
          note: "Supporting document",
          date: null as string | null,
          media_type: "application/pdf",
          url: matter.document_url,
          text: "",
          links: [] as any[],
        },
      ]
    : [];

  return {
    // Summary fields
    id: ocdId,
    session: matter.first_seen
      ? new Date(matter.first_seen).getFullYear().toString()
      : null,
    name: matter.identifier ?? null,
    title: matter.title ?? null,
    type: [matter.category?.toLowerCase() ?? "resolution"],
    subject: matter.category ? [matter.category] : ([] as string[]),
    classification: [matter.category?.toLowerCase() ?? "resolution"],
    organization_id: organizationOcdId,
    from_organization_id: null as string | null,
    chamber: null as string | null,
    extras: {},
    created_at: matter.created_at ?? null,
    updated_at: matter.created_at ?? null,
    sources: [] as any[],

    // Detail-only fields
    summaries,
    sponsors,
    actions,
    documents,
    versions: [] as any[],
    other_titles: [] as any[],
    related_bills: [] as any[],
  };
}
