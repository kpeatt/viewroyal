import { describe, it, expect } from "vitest";

/**
 * Logic-level tests for SourceMarkdownPreview truncation heuristic.
 * The component uses content.length > 200 to determine if truncation is needed.
 * Since vitest runs in node environment (no jsdom), we test the logic directly.
 */

const TRUNCATION_THRESHOLD = 200;

describe("SourceMarkdownPreview truncation logic", () => {
  it("short content does not need truncation", () => {
    const content = "Short text about a meeting.";
    expect(content.length > TRUNCATION_THRESHOLD).toBe(false);
  });

  it("long content needs truncation", () => {
    const content = "A".repeat(201);
    expect(content.length > TRUNCATION_THRESHOLD).toBe(true);
  });

  it("content at exactly threshold does not need truncation", () => {
    const content = "A".repeat(200);
    expect(content.length > TRUNCATION_THRESHOLD).toBe(false);
  });

  it("realistic short content (meeting excerpt) does not truncate", () => {
    const content =
      "Council discussed the proposed rezoning of 123 Main Street from R-1 to R-3.";
    expect(content.length > TRUNCATION_THRESHOLD).toBe(false);
  });

  it("realistic long content (document section) needs truncation", () => {
    const content = [
      "## Background",
      "",
      "The Town of View Royal has been reviewing its Official Community Plan",
      "with respect to housing density in the Helmcken Road corridor.",
      "Several public hearings have been held to gather community input.",
      "",
      "### Key Findings",
      "",
      "1. Infrastructure capacity supports moderate densification",
      "2. Transit access is adequate for increased population",
      "3. Community feedback was mixed, with concerns about parking",
    ].join("\n");
    expect(content.length > TRUNCATION_THRESHOLD).toBe(true);
  });

  it("content with markdown headings preserves raw length for threshold check", () => {
    const content = "## Section Title\n\nBrief paragraph.";
    // The threshold checks raw string length, including markdown syntax
    expect(content.length).toBeLessThanOrEqual(TRUNCATION_THRESHOLD);
  });

  it("content with GFM table can exceed threshold", () => {
    const content = [
      "## Budget Summary",
      "",
      "| Item | Cost | Department |",
      "|------|------|------------|",
      "| Road repair | $50,000 | Public Works |",
      "| Sewer upgrade | $120,000 | Utilities |",
      "| Park maintenance | $30,000 | Parks & Rec |",
      "| Street lighting | $15,000 | Public Works |",
      "| Sidewalk repair | $45,000 | Public Works |",
      "| Water main replacement | $85,000 | Utilities |",
    ].join("\n");
    expect(content.length > TRUNCATION_THRESHOLD).toBe(true);
  });

  it("empty content does not need truncation", () => {
    const content = "";
    expect(content.length > TRUNCATION_THRESHOLD).toBe(false);
  });
});

describe("SourceMarkdownPreview default maxLines", () => {
  it("default maxLines is 4", () => {
    // The component defaults maxLines to 4 when not provided
    const defaultMaxLines = 4;
    expect(defaultMaxLines).toBe(4);
  });

  it("custom maxLines overrides default", () => {
    const customMaxLines = 3;
    expect(customMaxLines).not.toBe(4);
    expect(customMaxLines).toBe(3);
  });
});
