import { describe, it, expect } from "vitest";
import { buildToolSummary } from "../../app/services/rag.server";

describe("buildToolSummary", () => {
  // --- Empty / falsy inputs ---

  it("returns 'No results found' for empty array", () => {
    expect(buildToolSummary("search_matters", [])).toBe("No results found");
  });

  it("returns 'No results found' for null", () => {
    expect(buildToolSummary("search_council_records", null)).toBe("No results found");
  });

  it("returns 'No results found' for undefined", () => {
    expect(buildToolSummary("search_documents", undefined)).toBe("No results found");
  });

  // --- String passthrough ---

  it("returns short string as-is", () => {
    expect(buildToolSummary("search_council_records", "No relevant segments found")).toBe(
      "No relevant segments found",
    );
  });

  it("truncates long strings to 200 chars", () => {
    const long = "x".repeat(300);
    const result = buildToolSummary("search_council_records", long);
    expect(result.length).toBeLessThanOrEqual(203); // 200 + "..."
  });

  // --- search_council_records (composite object) ---

  it("summarizes council records with motions and transcripts", () => {
    const result = buildToolSummary("search_council_records", {
      motions: [
        { meetings: { meeting_date: "2024-03-15" }, text_content: "..." },
        { meetings: { meeting_date: "2024-06-20" }, text_content: "..." },
        { meetings: { meeting_date: "2025-01-10" }, text_content: "..." },
        { meetings: { meeting_date: "2024-11-05" }, text_content: "..." },
      ],
      transcripts: [
        { speaker_name: "Mayor", text_content: "..." },
        { speaker_name: "Clerk", text_content: "..." },
      ],
      statements: [],
      agenda_items: [],
    });
    expect(result).toContain("4 motions");
    expect(result).toContain("2 transcripts");
  });

  it("summarizes council records with statements and agenda items", () => {
    const result = buildToolSummary("search_council_records", {
      motions: [],
      transcripts: [],
      statements: [
        { speaker_name: "Smith", statement_type: "proposal" },
        { speaker_name: "Jones", statement_type: "objection" },
      ],
      agenda_items: [
        { title: "Item 1" },
      ],
    });
    expect(result).toContain("2 statements");
    expect(result).toContain("1 agenda item");
  });

  it("returns 'No results found' for empty council records", () => {
    const result = buildToolSummary("search_council_records", {
      motions: [],
      transcripts: [],
      statements: [],
      agenda_items: [],
    });
    expect(result).toBe("No results found");
  });

  // --- search_documents (composite object) ---

  it("summarizes document sections and bylaws", () => {
    const result = buildToolSummary("search_documents", {
      document_sections: [
        { heading: "Background", document_title: "Report" },
        { heading: "Analysis", document_title: "Report" },
      ],
      bylaws: [
        { bylaw_number: "1234", bylaw_title: "Zoning" },
        { bylaw_number: "5678", bylaw_title: "Fees" },
        { bylaw_number: "1234", bylaw_title: "Zoning" },
      ],
    });
    expect(result).toContain("2 document sections");
    expect(result).toContain("3 bylaw sections");
  });

  it("returns 'No results found' for empty documents", () => {
    const result = buildToolSummary("search_documents", {
      document_sections: [],
      bylaws: [],
    });
    expect(result).toBe("No results found");
  });

  // --- get_person_info (composite object) ---

  it("summarizes person info with voting stats", () => {
    const result = buildToolSummary("get_person_info", {
      stats: { total: 50, yes: 45, no: 5 },
      transcript_segments: [],
      key_statements: [],
    });
    expect(result).toContain("50");
    expect(result).toContain("voting record");
  });

  it("summarizes person info with statements and segments", () => {
    const result = buildToolSummary("get_person_info", {
      transcript_segments: [
        { speaker_name: "Mayor", text_content: "..." },
        { speaker_name: "Mayor", text_content: "..." },
      ],
      key_statements: [
        { speaker_name: "Mayor", statement_type: "proposal" },
      ],
      stats: null,
    });
    expect(result).toContain("3 statements");
  });

  // --- search_matters (array) ---

  it("summarizes matters with count", () => {
    const matters = [
      { title: "Housing", status: "Active" },
      { title: "Parks", status: "Completed" },
    ];
    const result = buildToolSummary("search_matters", matters);
    expect(result).toContain("2");
    expect(result).toContain("matter");
  });

  // --- unknown tool with array ---

  it("returns generic count for unknown tool", () => {
    const result = buildToolSummary("unknown_tool", [{ id: 1 }]);
    expect(result).toContain("1");
    expect(result).toContain("result");
  });

  // --- get_current_date ---

  it("returns date string as-is for get_current_date", () => {
    expect(buildToolSummary("get_current_date", "2026-02-28")).toBe("2026-02-28");
  });
});
