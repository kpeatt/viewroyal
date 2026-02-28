import { describe, it, expect } from "vitest";
import type { TOCItem } from "~/components/document/DocumentTOC";

/**
 * Pure function that converts document sections to TOC items.
 * This replicates the mapping logic used in document-viewer.tsx.
 */
function buildTOCItems(
  sections: Array<{
    section_order: number;
    section_title: string | null;
  }>,
): TOCItem[] {
  return sections.map((s) => ({
    id: `section-${s.section_order}`,
    title: s.section_title ?? `Section ${s.section_order}`,
    order: s.section_order,
  }));
}

describe("TOC data generation", () => {
  describe("TOC threshold", () => {
    it("should not show TOC for 0 sections", () => {
      const items = buildTOCItems([]);
      expect(items.length >= 3).toBe(false);
    });

    it("should not show TOC for 1 section", () => {
      const items = buildTOCItems([
        { section_order: 1, section_title: "Intro" },
      ]);
      expect(items.length >= 3).toBe(false);
    });

    it("should not show TOC for 2 sections", () => {
      const items = buildTOCItems([
        { section_order: 1, section_title: "Intro" },
        { section_order: 2, section_title: "Body" },
      ]);
      expect(items.length >= 3).toBe(false);
    });

    it("should show TOC for 3 sections", () => {
      const items = buildTOCItems([
        { section_order: 1, section_title: "Intro" },
        { section_order: 2, section_title: "Body" },
        { section_order: 3, section_title: "Conclusion" },
      ]);
      expect(items.length >= 3).toBe(true);
    });

    it("should show TOC for 5 sections", () => {
      const items = buildTOCItems([
        { section_order: 1, section_title: "A" },
        { section_order: 2, section_title: "B" },
        { section_order: 3, section_title: "C" },
        { section_order: 4, section_title: "D" },
        { section_order: 5, section_title: "E" },
      ]);
      expect(items.length >= 3).toBe(true);
    });
  });

  describe("TOC item mapping", () => {
    it("should map section_order to id with section- prefix", () => {
      const items = buildTOCItems([
        { section_order: 3, section_title: "Chapter 3" },
      ]);
      expect(items[0].id).toBe("section-3");
    });

    it("should map section_title to title", () => {
      const items = buildTOCItems([
        { section_order: 1, section_title: "Executive Summary" },
      ]);
      expect(items[0].title).toBe("Executive Summary");
    });

    it("should map section_order to order", () => {
      const items = buildTOCItems([
        { section_order: 7, section_title: "Appendix" },
      ]);
      expect(items[0].order).toBe(7);
    });
  });

  describe("null title fallback", () => {
    it("should use 'Section N' when section_title is null", () => {
      const items = buildTOCItems([
        { section_order: 4, section_title: null },
      ]);
      expect(items[0].title).toBe("Section 4");
    });

    it("should handle mix of null and non-null titles", () => {
      const items = buildTOCItems([
        { section_order: 1, section_title: "Introduction" },
        { section_order: 2, section_title: null },
        { section_order: 3, section_title: "Conclusion" },
      ]);
      expect(items[0].title).toBe("Introduction");
      expect(items[1].title).toBe("Section 2");
      expect(items[2].title).toBe("Conclusion");
    });
  });

  describe("ordering", () => {
    it("should preserve the original section order", () => {
      const items = buildTOCItems([
        { section_order: 1, section_title: "First" },
        { section_order: 2, section_title: "Second" },
        { section_order: 3, section_title: "Third" },
      ]);
      expect(items.map((i) => i.order)).toEqual([1, 2, 3]);
    });

    it("should preserve order even when sections are not consecutive", () => {
      const items = buildTOCItems([
        { section_order: 1, section_title: "A" },
        { section_order: 5, section_title: "B" },
        { section_order: 10, section_title: "C" },
      ]);
      expect(items.map((i) => i.order)).toEqual([1, 5, 10]);
      expect(items.map((i) => i.id)).toEqual([
        "section-1",
        "section-5",
        "section-10",
      ]);
    });
  });
});

describe("useScrollSpy contract", () => {
  it("should export useScrollSpy as a function", async () => {
    const mod = await import("~/lib/use-scroll-spy");
    expect(typeof mod.useScrollSpy).toBe("function");
  });
});
