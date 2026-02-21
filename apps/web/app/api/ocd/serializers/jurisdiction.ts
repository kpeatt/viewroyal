/**
 * OCD Jurisdiction serializer.
 *
 * Maps a municipality row + organizations to an OCD Jurisdiction object.
 * Follows the allowlist pattern: explicitly construct new objects with only
 * public fields.  Never spread `...row`.  All OCD spec fields are present
 * (null when empty).
 */

import { ocdJurisdictionId } from "../lib/ocd-ids";

/**
 * Serialize a municipality into an OCD Jurisdiction.
 *
 * @param municipality - Row from the municipalities table
 * @param organizations - Array of organization rows (currently unused but
 *   reserved for legislative_sessions if View Royal ever formalizes them)
 * @param divisionId - OCD division ID (e.g. "ocd-division/country:ca/csd:5917047")
 */
export function serializeJurisdiction(
  municipality: any,
  organizations: any[],
  divisionId: string,
) {
  // Extract CSD code from divisionId: "ocd-division/country:ca/csd:5917047" -> "5917047"
  const csdMatch = divisionId.match(/csd:(\d+)/);
  const csdCode = csdMatch ? csdMatch[1] : "";

  return {
    id: ocdJurisdictionId(csdCode),
    name: municipality.name,
    url: municipality.website_url ?? null,
    classification: "government",
    division: {
      id: divisionId,
      name: municipality.short_name ?? municipality.name,
    },
    legislative_sessions: [] as any[],
    feature_flags: [] as string[],
    extras: {},
    created_at: municipality.created_at ?? null,
    updated_at: municipality.created_at ?? null,
    sources: [{ url: municipality.website_url ?? "", note: null }],
  };
}
