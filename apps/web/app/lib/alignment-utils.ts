// Helper to parse dates without timezone shifts
export const parseAlignmentDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split(/[- : T]/).map(Number);
  return new Date(y, m - 1, d || 1);
};

export interface AlignmentResult {
  personId: number;
  personName: string;
  imageUrl?: string | null;
  totalMotions: number;
  matchingVotes: number;
  alignmentRate: number;
}

/**
 * Calculates how often a target person aligns with all other people 
 * based on provided votes and memberships within a specific date range.
 */
export function calculateAlignmentForPerson(
  targetPersonId: number,
  allVotes: any[],
  memberships: any[],
  startDate: Date,
  endDate: Date
): AlignmentResult[] {
  // 1. Group votes by motion
  const votesByMotion: Record<number, Record<number, string>> = {};
  allVotes.forEach((v) => {
    const d = parseAlignmentDate(v.motions?.meetings?.meeting_date);
    if (d && d >= startDate && d < endDate) {
      if (!votesByMotion[v.motion_id]) {
        votesByMotion[v.motion_id] = {};
      }
      votesByMotion[v.motion_id][v.person_id] = v.vote;
    }
  });

  // 2. Determine tenure for each person in the memberships list
  const memberTenures = new Map<number, { start: Date; end: Date; name: string; image_url?: string }>();
  memberships.forEach((m) => {
    if (!m.people) return;
    const pid = m.people.id;
    const mStart = parseAlignmentDate(m.start_date) || new Date(0);
    const mEnd = parseAlignmentDate(m.end_date) || new Date(2100, 0, 1);

    if (!memberTenures.has(pid)) {
      memberTenures.set(pid, {
        start: mStart,
        end: mEnd,
        name: m.people.name,
        image_url: m.people.image_url
      });
    } else {
      const existing = memberTenures.get(pid)!;
      if (mStart < existing.start) existing.start = mStart;
      if (mEnd > existing.end) existing.end = mEnd;
    }
  });

  const targetTenure = memberTenures.get(targetPersonId);
  if (!targetTenure) return [];

  const results: AlignmentResult[] = [];

  memberTenures.forEach((otherPerson, otherId) => {
    if (otherId === targetPersonId) return;

    let totalCommonMotions = 0;
    let matchingVotes = 0;

    Object.entries(votesByMotion).forEach(([motionId, motionVotes]) => {
      // Find motion date if possible, otherwise skip or assume within range
      // (In this case we already filtered votesByMotion by date)
      
      const targetVote = motionVotes[targetPersonId];
      const otherVote = motionVotes[otherId];

      if (targetVote && otherVote) {
        // Strict overlapping membership check
        const overlapStart = otherPerson.start > targetTenure.start ? otherPerson.start : targetTenure.start;
        const overlapEnd = otherPerson.end < targetTenure.end ? otherPerson.end : targetTenure.end;
        
        // If there is no overlap in tenure, we skip even if they somehow have shared votes
        // (though they shouldn't if the data is clean, but this ensures strictness)
        if (overlapStart <= overlapEnd) {
          totalCommonMotions++;
          if (targetVote === otherVote) {
            matchingVotes++;
          }
        }
      }
    });

    if (totalCommonMotions > 0) {
      results.push({
        personId: otherId,
        personName: otherPerson.name,
        imageUrl: otherPerson.image_url,
        totalMotions: totalCommonMotions,
        matchingVotes: matchingVotes,
        alignmentRate: (matchingVotes / totalCommonMotions) * 100
      });
    }
  });

  return results.sort((a, b) => b.alignmentRate - a.alignmentRate);
}
