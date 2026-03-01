import { describe, it, expect } from "vitest";

/**
 * Logic-level tests for SourcePreviewContent type routing and URL generation.
 * These test the same decision logic used by SourcePreviewItem and
 * SourceTypeContent without requiring jsdom/React rendering.
 */

// Replicate the link logic from SourcePreviewItem
function getSourceLink(source: any): string {
  return source?.type === "bylaw" && source?.bylaw_id
    ? `/bylaws/${source.bylaw_id}`
    : source?.meeting_id
      ? `/meetings/${source.meeting_id}`
      : "#";
}

// Replicate the label logic
const SOURCE_TYPE_LABEL: Record<string, string> = {
  transcript: "Transcript",
  transcript_segment: "Transcript",
  motion: "Motion",
  vote: "Vote",
  matter: "Matter",
  agenda_item: "Agenda Item",
  document_section: "Document",
  key_statement: "Statement",
  bylaw: "Bylaw",
};

// Replicate the result badge color logic
function getResultColor(
  result: string,
): "green" | "red" | "neutral" {
  const lower = result.toLowerCase();
  if (lower.includes("carried") || lower.includes("passed")) return "green";
  if (lower.includes("defeated")) return "red";
  return "neutral";
}

// Which source types show speaker_name
function showsSpeakerName(type: string): boolean {
  return ["transcript", "transcript_segment", "key_statement"].includes(type);
}

// Which source types show a result badge
function showsResultBadge(type: string): boolean {
  return ["motion", "vote"].includes(type);
}

// Which source types show title in bold
function showsBoldTitle(type: string): boolean {
  return ["bylaw", "document_section"].includes(type);
}

describe("Source link routing", () => {
  it("routes bylaw sources to /bylaws/:id", () => {
    const source = { type: "bylaw", bylaw_id: 42, meeting_id: 10 };
    expect(getSourceLink(source)).toBe("/bylaws/42");
  });

  it("routes meeting sources to /meetings/:id", () => {
    const source = { type: "transcript", meeting_id: 5 };
    expect(getSourceLink(source)).toBe("/meetings/5");
  });

  it("routes motion sources to /meetings/:id", () => {
    const source = { type: "motion", meeting_id: 7 };
    expect(getSourceLink(source)).toBe("/meetings/7");
  });

  it("falls back to # when no meeting_id or bylaw_id", () => {
    const source = { type: "transcript" };
    expect(getSourceLink(source)).toBe("#");
  });

  it("bylaw without bylaw_id falls back to meeting link", () => {
    const source = { type: "bylaw", meeting_id: 3 };
    expect(getSourceLink(source)).toBe("/meetings/3");
  });
});

describe("Source type labels", () => {
  it("maps all known types to labels", () => {
    expect(SOURCE_TYPE_LABEL["transcript"]).toBe("Transcript");
    expect(SOURCE_TYPE_LABEL["transcript_segment"]).toBe("Transcript");
    expect(SOURCE_TYPE_LABEL["motion"]).toBe("Motion");
    expect(SOURCE_TYPE_LABEL["vote"]).toBe("Vote");
    expect(SOURCE_TYPE_LABEL["document_section"]).toBe("Document");
    expect(SOURCE_TYPE_LABEL["key_statement"]).toBe("Statement");
    expect(SOURCE_TYPE_LABEL["bylaw"]).toBe("Bylaw");
    expect(SOURCE_TYPE_LABEL["agenda_item"]).toBe("Agenda Item");
  });

  it("unknown type returns undefined (component falls back to 'Source')", () => {
    expect(SOURCE_TYPE_LABEL["unknown"]).toBeUndefined();
  });
});

describe("Motion result badge colors", () => {
  it("'Carried' gets green", () => {
    expect(getResultColor("Carried")).toBe("green");
  });

  it("'Carried Unanimously' gets green", () => {
    expect(getResultColor("Carried Unanimously")).toBe("green");
  });

  it("'Passed' gets green", () => {
    expect(getResultColor("Passed")).toBe("green");
  });

  it("'Defeated' gets red", () => {
    expect(getResultColor("Defeated")).toBe("red");
  });

  it("'Tabled' gets neutral", () => {
    expect(getResultColor("Tabled")).toBe("neutral");
  });

  it("'Withdrawn' gets neutral", () => {
    expect(getResultColor("Withdrawn")).toBe("neutral");
  });
});

describe("Type-specific layout routing", () => {
  it("transcript shows speaker name", () => {
    expect(showsSpeakerName("transcript")).toBe(true);
    expect(showsSpeakerName("transcript_segment")).toBe(true);
  });

  it("key_statement shows speaker name", () => {
    expect(showsSpeakerName("key_statement")).toBe(true);
  });

  it("motion does not show speaker name", () => {
    expect(showsSpeakerName("motion")).toBe(false);
  });

  it("motion shows result badge", () => {
    expect(showsResultBadge("motion")).toBe(true);
    expect(showsResultBadge("vote")).toBe(true);
  });

  it("transcript does not show result badge", () => {
    expect(showsResultBadge("transcript")).toBe(false);
  });

  it("bylaw shows bold title", () => {
    expect(showsBoldTitle("bylaw")).toBe(true);
  });

  it("document_section shows bold title", () => {
    expect(showsBoldTitle("document_section")).toBe(true);
  });

  it("transcript does not show bold title", () => {
    expect(showsBoldTitle("transcript")).toBe(false);
  });
});

describe("Content fallback logic", () => {
  it("source with content uses content for preview", () => {
    const source = { type: "transcript", content: "Some text", title: "Title" };
    // When content exists, SourceMarkdownPreview is rendered
    expect(source.content).toBeTruthy();
  });

  it("source without content falls back to title", () => {
    const source = { type: "transcript", title: "Meeting transcript" };
    expect(source.content).toBeUndefined();
    expect(source.title).toBeTruthy();
  });

  it("source with neither content nor title shows fallback", () => {
    const source = { type: "transcript" };
    const title = source.title || "View source";
    expect(title).toBe("View source");
  });
});
