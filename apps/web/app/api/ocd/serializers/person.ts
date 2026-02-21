/**
 * OCD Person serializer.
 *
 * Maps people rows to OCD Person objects.  Follows the allowlist pattern:
 * explicitly construct new objects with only public fields.  Never spread
 * `...row`.  All OCD spec fields are present (null when empty).
 */

import { mapClassification } from "./organization";

/**
 * Serialize a person row for list views (lightweight, no nested data).
 *
 * @param person - Row from the people table
 * @param ocdId - Pre-computed OCD ID for this person
 */
export function serializePersonSummary(person: any, ocdId: string) {
  return {
    id: ocdId,
    name: person.name,
    sort_name: person.name ?? null,
    family_name: null as string | null,
    given_name: null as string | null,
    image: person.image_url ?? null,
    gender: null as string | null,
    birth_date: null as string | null,
    death_date: null as string | null,
    extras: {},
    created_at: person.created_at ?? null,
    updated_at: person.created_at ?? null,
    sources: [] as any[],
  };
}

/**
 * Serialize a person row for detail views with memberships.
 *
 * @param person - Row from the people table
 * @param ocdId - Pre-computed OCD ID for this person
 * @param memberships - Membership rows with joined organization data
 * @param orgOcdIds - Map of organization PK to OCD Organization ID
 */
export function serializePersonDetail(
  person: any,
  ocdId: string,
  memberships: any[],
  orgOcdIds: Map<number, string>,
) {
  return {
    // Summary fields
    id: ocdId,
    name: person.name,
    sort_name: person.name ?? null,
    family_name: null as string | null,
    given_name: null as string | null,
    image: person.image_url ?? null,
    gender: null as string | null,
    birth_date: null as string | null,
    death_date: null as string | null,
    extras: {},
    created_at: person.created_at ?? null,
    updated_at: person.created_at ?? null,
    sources: [] as any[],

    // Detail-only fields
    identifiers: [] as any[],
    other_names: [] as any[],
    links: [] as any[],
    contact_details: person.email
      ? [{ type: "email", value: person.email, note: null, label: null }]
      : ([] as any[]),
    memberships: memberships.map((m: any) => ({
      organization: m.organization
        ? {
            id: orgOcdIds.get(m.organization.id) ?? null,
            name: m.organization.name,
            classification: mapClassification(
              m.organization.classification ?? "",
            ),
          }
        : null,
      role: m.role ?? "member",
      label: m.role ?? "Member",
      start_date: m.start_date ?? null,
      end_date: m.end_date ?? null,
      person_id: ocdId,
    })),
  };
}
