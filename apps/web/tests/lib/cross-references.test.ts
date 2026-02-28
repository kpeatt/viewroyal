import { describe, it, expect } from "vitest";
import { detectCrossReferences } from "../../app/lib/cross-references";

const MOCK_BYLAWS = [
  { id: 1, title: "Land Use Procedures Bylaw", bylaw_number: "35" },
  { id: 2, title: "Zoning Bylaw", bylaw_number: "900" },
  { id: 3, title: "Tree Protection Bylaw", bylaw_number: "1059" },
  { id: 4, title: "Official Community Plan Bylaw", bylaw_number: "811" },
];

describe("detectCrossReferences", () => {
  it("extracts a single bylaw reference", () => {
    const sections = [
      { section_text: "This amends Bylaw No. 1059 regarding trees.", section_order: 1 },
    ];
    const result = detectCrossReferences(sections, MOCK_BYLAWS);

    expect(result).toHaveLength(1);
    expect(result[0].bylawNumber).toBe("1059");
    expect(result[0].targetId).toBe(3);
    expect(result[0].targetTitle).toBe("Tree Protection Bylaw");
    expect(result[0].pattern).toBe("Bylaw No. 1059");
  });

  it("handles year suffix (Bylaw No. 1059, 2020)", () => {
    const sections = [
      { section_text: "Pursuant to Bylaw No. 1059, 2020 the applicant...", section_order: 1 },
    ];
    const result = detectCrossReferences(sections, MOCK_BYLAWS);

    expect(result).toHaveLength(1);
    expect(result[0].bylawNumber).toBe("1059");
    expect(result[0].targetId).toBe(3);
  });

  it("filters out false positives (bylaw not in database)", () => {
    const sections = [
      { section_text: "Bylaw No. 9999 is referenced here.", section_order: 1 },
    ];
    const result = detectCrossReferences(sections, MOCK_BYLAWS);

    expect(result).toHaveLength(0);
  });

  it("deduplicates same bylaw across multiple sections", () => {
    const sections = [
      { section_text: "See Bylaw No. 1059 for details.", section_order: 1 },
      { section_text: "As per Bylaw No. 1059 section 4.", section_order: 3 },
      { section_text: "Bylaw No. 1059 applies to all properties.", section_order: 5 },
    ];
    const result = detectCrossReferences(sections, MOCK_BYLAWS);

    expect(result).toHaveLength(1);
    expect(result[0].bylawNumber).toBe("1059");
    expect(result[0].sectionOrders).toEqual([1, 3, 5]);
  });

  it("returns multiple cross-references for different bylaws", () => {
    const sections = [
      { section_text: "Bylaw No. 35 and Bylaw No. 900 are relevant.", section_order: 1 },
    ];
    const result = detectCrossReferences(sections, MOCK_BYLAWS);

    expect(result).toHaveLength(2);
    const numbers = result.map((r) => r.bylawNumber);
    expect(numbers).toContain("35");
    expect(numbers).toContain("900");
  });

  it("returns empty array when no bylaw patterns found", () => {
    const sections = [
      { section_text: "This document has no bylaw references.", section_order: 1 },
    ];
    const result = detectCrossReferences(sections, MOCK_BYLAWS);

    expect(result).toHaveLength(0);
  });

  it("builds correct targetUrl using bylaw id (not bylaw_number)", () => {
    const sections = [
      { section_text: "Bylaw No. 35 governs procedures.", section_order: 1 },
    ];
    const result = detectCrossReferences(sections, MOCK_BYLAWS);

    expect(result).toHaveLength(1);
    expect(result[0].targetUrl).toBe("/bylaws/1");
    // NOT /bylaws/35 (which would be bylaw_number)
  });

  it("sorts results by first occurrence (lowest sectionOrder)", () => {
    const sections = [
      { section_text: "Reference to Bylaw No. 900.", section_order: 5 },
      { section_text: "Reference to Bylaw No. 35.", section_order: 2 },
      { section_text: "Reference to Bylaw No. 1059.", section_order: 8 },
    ];
    const result = detectCrossReferences(sections, MOCK_BYLAWS);

    expect(result).toHaveLength(3);
    expect(result[0].bylawNumber).toBe("35");
    expect(result[1].bylawNumber).toBe("900");
    expect(result[2].bylawNumber).toBe("1059");
  });

  it("handles short bylaw numbers", () => {
    const sections = [
      { section_text: "Bylaw No. 35 establishes procedures.", section_order: 1 },
    ];
    const result = detectCrossReferences(sections, MOCK_BYLAWS);

    expect(result).toHaveLength(1);
    expect(result[0].bylawNumber).toBe("35");
  });

  it("handles multiple references in the same section", () => {
    const sections = [
      {
        section_text: "Bylaw No. 1059 and Bylaw No. 811 both apply. Also see Bylaw No. 1059 again.",
        section_order: 1,
      },
    ];
    const result = detectCrossReferences(sections, MOCK_BYLAWS);

    expect(result).toHaveLength(2);
    const numbers = result.map((r) => r.bylawNumber);
    expect(numbers).toContain("1059");
    expect(numbers).toContain("811");
    // Verify sectionOrders has no duplicates for "1059"
    const ref1059 = result.find((r) => r.bylawNumber === "1059")!;
    expect(ref1059.sectionOrders).toEqual([1]);
  });

  it("returns empty array for empty sections", () => {
    const result = detectCrossReferences([], MOCK_BYLAWS);
    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty bylaws list", () => {
    const sections = [
      { section_text: "Bylaw No. 1059 is referenced.", section_order: 1 },
    ];
    const result = detectCrossReferences(sections, []);
    expect(result).toHaveLength(0);
  });
});
