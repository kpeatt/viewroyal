import { describe, it, expect } from "vitest";
import { buildToolSummary } from "../../app/services/rag.server";

describe("buildToolSummary", () => {
  // --- Empty / falsy inputs ---

  it("returns 'No results found' for empty array", () => {
    expect(buildToolSummary("search_motions", [])).toBe("No results found");
  });

  it("returns 'No results found' for null", () => {
    expect(buildToolSummary("search_motions", null)).toBe("No results found");
  });

  it("returns 'No results found' for undefined", () => {
    expect(buildToolSummary("search_motions", undefined)).toBe("No results found");
  });

  // --- String passthrough ---

  it("returns short string as-is", () => {
    expect(buildToolSummary("search_transcript_segments", "No relevant segments found")).toBe(
      "No relevant segments found",
    );
  });

  it("truncates long strings to 200 chars", () => {
    const long = "x".repeat(300);
    const result = buildToolSummary("search_transcript_segments", long);
    expect(result.length).toBeLessThanOrEqual(203); // 200 + "..."
  });

  // --- search_motions ---

  it("summarizes motions with count and date range", () => {
    const motions = [
      { meetings: { meeting_date: "2024-03-15" }, text_content: "..." },
      { meetings: { meeting_date: "2024-06-20" }, text_content: "..." },
      { meetings: { meeting_date: "2025-01-10" }, text_content: "..." },
      { meetings: { meeting_date: "2024-11-05" }, text_content: "..." },
    ];
    const result = buildToolSummary("search_motions", motions);
    expect(result).toContain("4");
    expect(result).toContain("motion");
    expect(result).toContain("2024-03-15");
    expect(result).toContain("2025-01-10");
  });

  // --- search_bylaws ---

  it("summarizes bylaws with count and unique bylaw numbers", () => {
    const bylaws = [
      { bylaw_number: "1234", bylaw_title: "Zoning", text_content: "..." },
      { bylaw_number: "1234", bylaw_title: "Zoning", text_content: "..." },
      { bylaw_number: "5678", bylaw_title: "Fees", text_content: "..." },
    ];
    const result = buildToolSummary("search_bylaws", bylaws);
    expect(result).toContain("3");
    expect(result).toContain("bylaw");
    expect(result).toContain("1234");
    expect(result).toContain("5678");
  });

  // --- search_key_statements ---

  it("summarizes key statements with count and speakers", () => {
    const statements = [
      { speaker_name: "Smith", statement_type: "proposal", meetings: { meeting_date: "2024-05-01" } },
      { speaker_name: "Jones", statement_type: "objection", meetings: { meeting_date: "2024-05-01" } },
    ];
    const result = buildToolSummary("search_key_statements", statements);
    expect(result).toContain("2");
    expect(result).toContain("statement");
    expect(result).toContain("Smith");
    expect(result).toContain("Jones");
  });

  // --- get_voting_history ---

  it("summarizes voting history with stats", () => {
    const voting = { stats: { total: 50, yes: 45, no: 5 } };
    const result = buildToolSummary("get_voting_history", voting);
    expect(result).toContain("50");
    expect(result).toContain("45");
    expect(result).toContain("5");
  });

  // --- search_transcript_segments (array) ---

  it("summarizes transcript segments with speakers", () => {
    const segments = [
      { speaker_name: "Mayor", text_content: "...", meetings: { meeting_date: "2024-01-01" } },
      { speaker_name: "Clerk", text_content: "...", meetings: { meeting_date: "2024-02-01" } },
      { speaker_name: "Mayor", text_content: "...", meetings: { meeting_date: "2024-02-01" } },
    ];
    const result = buildToolSummary("search_transcript_segments", segments);
    expect(result).toContain("3");
    expect(result).toContain("transcript");
    expect(result).toContain("Mayor");
    expect(result).toContain("Clerk");
  });

  // --- search_document_sections ---

  it("summarizes document sections with count", () => {
    const sections = [
      { heading: "Background", document_title: "Report", meeting_date: "2024-03-01" },
      { heading: "Analysis", document_title: "Report", meeting_date: "2024-06-01" },
    ];
    const result = buildToolSummary("search_document_sections", sections);
    expect(result).toContain("2");
    expect(result).toContain("document");
  });

  // --- search_agenda_items ---

  it("summarizes agenda items with count", () => {
    const items = [
      { title: "Item 1", meetings: { meeting_date: "2024-01-01" } },
      { title: "Item 2", meetings: { meeting_date: "2024-02-01" } },
    ];
    const result = buildToolSummary("search_agenda_items", items);
    expect(result).toContain("2");
    expect(result).toContain("agenda");
  });

  // --- search_matters ---

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
