import { describe, it, expect } from "vitest";
import { sortResults } from "~/services/hybrid-search.server";
import type { UnifiedSearchResult } from "~/services/hybrid-search.server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(
  overrides: Partial<UnifiedSearchResult> & { id: number },
): UnifiedSearchResult {
  return {
    type: "motion",
    title: `Result ${overrides.id}`,
    content: "test content",
    meeting_id: overrides.id,
    meeting_date: null,
    rank_score: 0.5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// sortResults
// ---------------------------------------------------------------------------

describe("sortResults", () => {
  const results: UnifiedSearchResult[] = [
    makeResult({ id: 1, meeting_date: "2024-01-15", rank_score: 0.8 }),
    makeResult({ id: 2, meeting_date: "2024-06-01", rank_score: 0.95 }),
    makeResult({ id: 3, meeting_date: "2024-03-10", rank_score: 0.6 }),
    makeResult({ id: 4, meeting_date: null, rank_score: 0.75 }),
  ];

  it('sorts by newest first (descending date, nulls last)', () => {
    const sorted = sortResults(results, "newest");
    expect(sorted.map((r) => r.meeting_date)).toEqual([
      "2024-06-01",
      "2024-03-10",
      "2024-01-15",
      null,
    ]);
  });

  it('sorts by oldest first (ascending date, nulls last)', () => {
    const sorted = sortResults(results, "oldest");
    expect(sorted.map((r) => r.meeting_date)).toEqual([
      "2024-01-15",
      "2024-03-10",
      "2024-06-01",
      null,
    ]);
  });

  it('sorts by relevance (rank_score descending) for empty string', () => {
    const sorted = sortResults(results, "");
    expect(sorted.map((r) => r.rank_score)).toEqual([0.95, 0.8, 0.75, 0.6]);
  });

  it('sorts by relevance for undefined sort', () => {
    const sorted = sortResults(results, undefined);
    expect(sorted.map((r) => r.rank_score)).toEqual([0.95, 0.8, 0.75, 0.6]);
  });

  it('sorts by relevance for "relevance" string', () => {
    const sorted = sortResults(results, "relevance");
    expect(sorted.map((r) => r.rank_score)).toEqual([0.95, 0.8, 0.75, 0.6]);
  });

  it("null dates always sort last regardless of direction", () => {
    const withNulls = [
      makeResult({ id: 1, meeting_date: null }),
      makeResult({ id: 2, meeting_date: "2024-01-01" }),
      makeResult({ id: 3, meeting_date: null }),
    ];

    const newest = sortResults(withNulls, "newest");
    expect(newest.map((r) => r.meeting_date)).toEqual([
      "2024-01-01",
      null,
      null,
    ]);

    const oldest = sortResults(withNulls, "oldest");
    expect(oldest.map((r) => r.meeting_date)).toEqual([
      "2024-01-01",
      null,
      null,
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(sortResults([], "newest")).toEqual([]);
    expect(sortResults([], "oldest")).toEqual([]);
    expect(sortResults([], "")).toEqual([]);
  });

  it("returns unchanged for single-item array", () => {
    const single = [makeResult({ id: 1, meeting_date: "2024-01-01" })];
    expect(sortResults(single, "newest")).toEqual(single);
    expect(sortResults(single, "oldest")).toEqual(single);
    expect(sortResults(single, "")).toEqual(single);
  });
});
