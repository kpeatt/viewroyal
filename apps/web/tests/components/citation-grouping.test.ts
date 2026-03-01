import { describe, it, expect } from "vitest";
import {
  groupCitationParts,
  type CitationToken,
} from "../../app/components/search/citation-badge";

// Mock sources array: 10 sources with sequential IDs
const mockSources = Array.from({ length: 10 }, (_, i) => ({
  type: "transcript",
  id: i + 1,
  meeting_id: 1,
  meeting_date: "2024-01-01",
  title: `Source ${i + 1}`,
}));

/**
 * Helper to split text the same way processCitationNode does,
 * then run the grouping algorithm.
 */
function groupFromText(text: string, sources = mockSources): CitationToken[] {
  const parts = text.split(/(\[\d+\])/g);
  return groupCitationParts(parts, sources);
}

describe("groupCitationParts", () => {
  it("returns no tokens for text without citations", () => {
    const tokens = groupFromText("no citations here");
    expect(tokens).toEqual([{ type: "text", text: "no citations here" }]);
  });

  it("keeps single citation as a single token", () => {
    const tokens = groupFromText("text [1] more");
    expect(tokens).toHaveLength(3);
    expect(tokens[0]).toEqual({ type: "text", text: "text " });
    expect(tokens[1]).toMatchObject({ type: "single", num: 1 });
    expect(tokens[2]).toEqual({ type: "text", text: " more" });
  });

  it("groups two consecutive citations", () => {
    const tokens = groupFromText("text [1][2] more");
    expect(tokens).toHaveLength(3);
    expect(tokens[0]).toEqual({ type: "text", text: "text " });
    expect(tokens[1]).toMatchObject({
      type: "group",
      nums: [1, 2],
    });
    expect((tokens[1] as any).sources).toHaveLength(2);
    expect(tokens[2]).toEqual({ type: "text", text: " more" });
  });

  it("groups three consecutive citations", () => {
    const tokens = groupFromText("text [1][2][3] more");
    expect(tokens).toHaveLength(3);
    expect(tokens[1]).toMatchObject({
      type: "group",
      nums: [1, 2, 3],
    });
    expect((tokens[1] as any).sources).toHaveLength(3);
  });

  it("keeps non-consecutive citations as separate singles", () => {
    const tokens = groupFromText("text [1] and [2] more");
    const singles = tokens.filter((t) => t.type === "single");
    expect(singles).toHaveLength(2);
    expect(singles[0]).toMatchObject({ type: "single", num: 1 });
    expect(singles[1]).toMatchObject({ type: "single", num: 2 });
  });

  it("handles mixed group and single", () => {
    const tokens = groupFromText("text [1][2] then [5] end");
    const group = tokens.find((t) => t.type === "group");
    const single = tokens.find((t) => t.type === "single");
    expect(group).toMatchObject({ type: "group", nums: [1, 2] });
    expect(single).toMatchObject({ type: "single", num: 5 });
  });

  it("handles adjacent groups separated by text", () => {
    const tokens = groupFromText("[1][2] text [3][4]");
    const groups = tokens.filter((t) => t.type === "group");
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ type: "group", nums: [1, 2] });
    expect(groups[1]).toMatchObject({ type: "group", nums: [3, 4] });
  });

  it("skips citations with out-of-range source numbers", () => {
    const smallSources = mockSources.slice(0, 3); // Only 3 sources
    const tokens = groupFromText("text [5] more", smallSources);
    // [5] has no matching source, so it's dropped
    const singles = tokens.filter((t) => t.type === "single");
    expect(singles).toHaveLength(0);
  });

  it("handles group where some sources are out of range", () => {
    const smallSources = mockSources.slice(0, 2); // Only 2 sources
    const tokens = groupFromText("text [1][2][5] more", smallSources);
    // [1] and [2] valid, [5] invalid — group includes valid sources
    const group = tokens.find((t) => t.type === "group");
    expect(group).toMatchObject({ type: "group", nums: [1, 2, 5] });
    expect((group as any).sources).toHaveLength(2); // Only 2 valid
  });

  it("handles citation at start of text", () => {
    const tokens = groupFromText("[1] start");
    expect(tokens[0]).toMatchObject({ type: "single", num: 1 });
    expect(tokens[1]).toEqual({ type: "text", text: " start" });
  });

  it("handles citation at end of text", () => {
    const tokens = groupFromText("end [3]");
    const last = tokens[tokens.length - 1];
    expect(last).toMatchObject({ type: "single", num: 3 });
  });

  it("handles only citations with no text", () => {
    const tokens = groupFromText("[1][2][3]");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ type: "group", nums: [1, 2, 3] });
  });
});
