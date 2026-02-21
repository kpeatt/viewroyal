/**
 * OCD Organization serializer.
 *
 * Maps organization rows to OCD Organization objects.  Follows the allowlist
 * pattern: explicitly construct new objects with only public fields.  Never
 * spread `...row`.  All OCD spec fields are present (null when empty).
 */

/**
 * Map internal classification strings to OCD classification values.
 *
 * - Council  -> legislature
 * - Committee -> committee
 * - Board    -> commission
 * - default  -> committee
 */
export function mapClassification(dbClassification: string): string {
  switch (dbClassification) {
    case "Council":
      return "legislature";
    case "Committee":
      return "committee";
    case "Board":
      return "commission";
    default:
      return "committee";
  }
}

/**
 * Serialize an organization row for list views (lightweight, no nested data).
 *
 * @param org - Row from the organizations table
 * @param ocdId - Pre-computed OCD ID for this organization
 * @param jurisdictionId - OCD Jurisdiction ID for this municipality
 */
export function serializeOrganizationSummary(
  org: any,
  ocdId: string,
  jurisdictionId: string,
) {
  return {
    id: ocdId,
    name: org.name,
    classification: mapClassification(org.classification ?? ""),
    jurisdiction_id: jurisdictionId,
    parent_id: null as string | null,
    image: null as string | null,
    extras: {},
    created_at: org.created_at ?? null,
    updated_at: org.created_at ?? null,
    sources: [] as any[],
  };
}

/**
 * Serialize an organization row for detail views with posts (derived from memberships).
 *
 * @param org - Row from the organizations table
 * @param ocdId - Pre-computed OCD ID for this organization
 * @param jurisdictionId - OCD Jurisdiction ID for this municipality
 * @param memberships - Membership rows with joined person data
 * @param memberOcdIds - Map of person PK to OCD Person ID
 */
export function serializeOrganizationDetail(
  org: any,
  ocdId: string,
  jurisdictionId: string,
  memberships: any[],
  memberOcdIds: Map<number, string>,
) {
  return {
    // Summary fields
    id: ocdId,
    name: org.name,
    classification: mapClassification(org.classification ?? ""),
    jurisdiction_id: jurisdictionId,
    parent_id: null as string | null,
    image: null as string | null,
    extras: {},
    created_at: org.created_at ?? null,
    updated_at: org.created_at ?? null,
    sources: [] as any[],

    // Detail-only fields
    links: [] as any[],
    contact_details: [] as any[],
    posts: memberships.map((m: any) => ({
      id: null as string | null,
      label: m.role ?? "Member",
      role: m.role ?? "member",
      organization_id: ocdId,
      division_id: null as string | null,
      start_date: m.start_date ?? null,
      end_date: m.end_date ?? null,
      person: m.person
        ? {
            id: memberOcdIds.get(m.person.id) ?? null,
            name: m.person.name,
          }
        : null,
    })),
  };
}
