/**
 * Person serializers.
 *
 * Allowlist pattern: explicitly construct new objects with only public fields.
 * Never spread `...row`.  All fields use snake_case.  Null fields are always
 * included (never omitted).
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serializeMembership(m: any) {
  return {
    organization_name: m.organization?.name ?? m.organization_name ?? null,
    role: m.role ?? null,
    start_date: m.start_date ?? null,
    end_date: m.end_date ?? null,
  };
}

/**
 * Derive whether a person is a current councillor from their memberships.
 * A person is considered a current councillor if they have at least one active
 * membership (no end_date or end_date in the future).
 */
function deriveIsCurrentCouncillor(row: any): boolean {
  if (row.is_councillor === true) return true;
  if (!row.memberships || !Array.isArray(row.memberships)) return false;

  const today = new Date().toISOString().split("T")[0];
  return row.memberships.some(
    (m: any) => !m.end_date || m.end_date >= today,
  );
}

// ---------------------------------------------------------------------------
// Summary (list view)
// ---------------------------------------------------------------------------

export function serializePersonSummary(row: any) {
  return {
    slug: row.slug ?? null,
    name: row.name ?? null,
    is_current_councillor: deriveIsCurrentCouncillor(row),
    party: null, // BC municipal -- no parties
    image_url: row.image_url ?? null,
  };
}

// ---------------------------------------------------------------------------
// Detail (single person)
// ---------------------------------------------------------------------------

export function serializePersonDetail(
  row: any,
  related: {
    memberships?: any[];
    votingSummary?: {
      total_votes: number;
      votes_for: number;
      votes_against: number;
      abstentions: number;
    };
  },
) {
  return {
    // Summary fields
    slug: row.slug ?? null,
    name: row.name ?? null,
    is_current_councillor: deriveIsCurrentCouncillor(row),
    party: null,
    image_url: row.image_url ?? null,

    // Detail-only fields
    memberships: (related.memberships ?? row.memberships ?? []).map(
      serializeMembership,
    ),
    voting_summary: related.votingSummary ?? {
      total_votes: 0,
      votes_for: 0,
      votes_against: 0,
      abstentions: 0,
    },
  };
}
