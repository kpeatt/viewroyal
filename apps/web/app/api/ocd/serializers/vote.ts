/**
 * OCD Vote serializer.
 *
 * Maps motion rows to OCD Vote objects.  Follows the allowlist pattern:
 * explicitly construct new objects with only public fields.  Never spread
 * `...row`.  All OCD spec fields are present (null when empty).
 *
 * Votes include roll call data from individual vote records.  Vote counts
 * are computed from actual roll call data for consistency (per RESEARCH.md
 * pitfall 3), falling back to summary columns only when no individual
 * votes exist.
 */

/**
 * Map motion result string to an OCD `passed` boolean.
 *
 * - CARRIED, CARRIED AS AMENDED, CARRRIED, AMENDED -> true
 * - DEFEATED, FAILED, FAILED FOR LACK OF A SECONDER, FAILED FOR LACK OF SECONDER, NOT CARRIED -> false
 * - TABLED, WITHDRAWN -> null
 * - null/unknown -> null
 */
export function mapResultToPassed(result: string | null): boolean | null {
  if (!result) return null;

  const upper = result.toUpperCase().trim();

  switch (upper) {
    case "CARRIED":
    case "CARRIED AS AMENDED":
    case "CARRRIED":
    case "AMENDED":
      return true;
    case "DEFEATED":
    case "FAILED":
    case "FAILED FOR LACK OF A SECONDER":
    case "FAILED FOR LACK OF SECONDER":
    case "NOT CARRIED":
      return false;
    case "TABLED":
    case "WITHDRAWN":
      return null;
    default:
      return null;
  }
}

/**
 * Map individual vote value strings to OCD vote_type values.
 *
 * - Yes, YES, AYE, For -> "yes"
 * - No, NO, Against -> "no"
 * - Abstain, Recused -> "abstain"
 * - Absent, No Vote -> "absent"
 * - default -> "other"
 */
export function mapVoteValue(vote: string | null): string {
  if (!vote) return "other";

  const upper = vote.toUpperCase().trim();

  switch (upper) {
    case "YES":
    case "AYE":
    case "FOR":
      return "yes";
    case "NO":
    case "AGAINST":
      return "no";
    case "ABSTAIN":
    case "RECUSED":
      return "abstain";
    case "ABSENT":
    case "NO VOTE":
      return "absent";
    default:
      return "other";
  }
}

/**
 * Serialize a motion row for list views (lightweight, no nested data).
 *
 * @param motion - Row from the motions table with joined meeting data
 * @param ocdId - Pre-computed OCD ID for this vote
 * @param organizationOcdId - OCD ID for the Council organization
 */
export function serializeVoteSummary(
  motion: any,
  ocdId: string,
  organizationOcdId: string,
) {
  return {
    id: ocdId,
    organization_id: organizationOcdId,
    organization: {
      name: motion.organization_name ?? "Council",
    },
    session: motion.meeting_date
      ? new Date(motion.meeting_date).getFullYear().toString()
      : null,
    chamber: null as string | null,
    date: motion.meeting_date ?? null,
    motion: motion.text_content ?? motion.plain_english_summary ?? null,
    type: ["bill-passage"],
    passed: mapResultToPassed(motion.result),
    created_at: motion.created_at ?? null,
    updated_at: motion.created_at ?? null,
    sources: [] as any[],
  };
}

/**
 * Serialize a motion row for detail views with roll call and vote counts.
 *
 * Vote counts are computed from actual roll_call data for consistency.
 * If no individual votes exist, falls back to summary columns.
 *
 * @param motion - Row from the motions table with joined meeting data
 * @param ocdId - Pre-computed OCD ID for this vote
 * @param organizationOcdId - OCD ID for the Council organization
 * @param related - Related data: individual votes, voter OCD IDs, linked bill OCD ID
 */
export function serializeVoteDetail(
  motion: any,
  ocdId: string,
  organizationOcdId: string,
  related: {
    individualVotes: any[];
    voterOcdIds: Map<number, string>;
    billOcdId: string | null;
  },
) {
  // Build roll call from individual votes
  const rollCall = (related.individualVotes ?? []).map((v: any) => ({
    person: {
      id: v.person_id
        ? (related.voterOcdIds.get(v.person_id) ?? null)
        : null,
      name: v.person?.name ?? null,
    },
    vote_type: mapVoteValue(v.vote),
  }));

  // Compute vote_counts from roll call data (per RESEARCH.md pitfall 3)
  let voteCounts: { vote_type: string; count: number }[];

  if (rollCall.length > 0) {
    // Compute from actual roll call data
    const countMap = new Map<string, number>();
    for (const entry of rollCall) {
      const current = countMap.get(entry.vote_type) ?? 0;
      countMap.set(entry.vote_type, current + 1);
    }
    voteCounts = Array.from(countMap.entries()).map(([vote_type, count]) => ({
      vote_type,
      count,
    }));
  } else {
    // Fallback to summary columns when no individual votes exist
    voteCounts = [];
    if (motion.yes_votes != null && motion.yes_votes > 0) {
      voteCounts.push({ vote_type: "yes", count: motion.yes_votes });
    }
    if (motion.no_votes != null && motion.no_votes > 0) {
      voteCounts.push({ vote_type: "no", count: motion.no_votes });
    }
    if (motion.abstain_votes != null && motion.abstain_votes > 0) {
      voteCounts.push({ vote_type: "abstain", count: motion.abstain_votes });
    }
  }

  // Build bill reference if linked
  const bill = related.billOcdId
    ? {
        id: related.billOcdId,
        name: motion.matter_title ?? null,
        chamber: null as string | null,
      }
    : null;

  return {
    // Summary fields
    id: ocdId,
    organization_id: organizationOcdId,
    organization: {
      name: motion.organization_name ?? "Council",
    },
    session: motion.meeting_date
      ? new Date(motion.meeting_date).getFullYear().toString()
      : null,
    chamber: null as string | null,
    date: motion.meeting_date ?? null,
    motion: motion.text_content ?? motion.plain_english_summary ?? null,
    type: ["bill-passage"],
    passed: mapResultToPassed(motion.result),
    created_at: motion.created_at ?? null,
    updated_at: motion.created_at ?? null,
    sources: [] as any[],

    // Detail-only fields
    bill,
    vote_counts: voteCounts,
    roll_call: rollCall,
  };
}
