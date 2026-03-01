import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getDateRange,
  parseSearchFilters,
  serializeSearchFilters,
} from "~/lib/search-params";

// ---------------------------------------------------------------------------
// getDateRange
// ---------------------------------------------------------------------------

describe("getDateRange", () => {
  beforeEach(() => {
    // Fix date to 2024-06-15 for deterministic tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null boundaries for empty string', () => {
    expect(getDateRange("")).toEqual({ from: null, to: null });
  });

  it('returns null boundaries for unknown value', () => {
    expect(getDateRange("decade")).toEqual({ from: null, to: null });
  });

  it('calculates week range (7 days ago to today)', () => {
    const result = getDateRange("week");
    expect(result).toEqual({ from: "2024-06-08", to: "2024-06-15" });
  });

  it('calculates month range (1 month ago to today)', () => {
    const result = getDateRange("month");
    expect(result).toEqual({ from: "2024-05-15", to: "2024-06-15" });
  });

  it('calculates year range (1 year ago to today)', () => {
    const result = getDateRange("year");
    expect(result).toEqual({ from: "2023-06-15", to: "2024-06-15" });
  });
});

// ---------------------------------------------------------------------------
// parseSearchFilters
// ---------------------------------------------------------------------------

describe("parseSearchFilters", () => {
  it("parses all filter params", () => {
    const params = new URLSearchParams(
      "time=week&type=motion&type=document_section&sort=newest",
    );
    expect(parseSearchFilters(params)).toEqual({
      time: "week",
      types: ["motion", "document_section"],
      sort: "newest",
    });
  });

  it("returns defaults for empty params", () => {
    const params = new URLSearchParams();
    expect(parseSearchFilters(params)).toEqual({
      time: "",
      types: [],
      sort: "",
    });
  });

  it("filters out invalid type values", () => {
    const params = new URLSearchParams("type=motion&type=invalid&type=key_statement");
    const result = parseSearchFilters(params);
    expect(result.types).toEqual(["motion", "key_statement"]);
  });

  it("handles duplicate type params correctly", () => {
    const params = new URLSearchParams("type=motion&type=motion");
    const result = parseSearchFilters(params);
    expect(result.types).toEqual(["motion", "motion"]);
  });
});

// ---------------------------------------------------------------------------
// serializeSearchFilters
// ---------------------------------------------------------------------------

describe("serializeSearchFilters", () => {
  it("serializes all non-default values", () => {
    const params = serializeSearchFilters({
      time: "week",
      types: ["motion"],
      sort: "newest",
    });
    expect(params.get("time")).toBe("week");
    expect(params.getAll("type")).toEqual(["motion"]);
    expect(params.get("sort")).toBe("newest");
  });

  it("omits default values for clean URLs", () => {
    const params = serializeSearchFilters({
      time: "",
      types: [],
      sort: "",
    });
    expect(params.toString()).toBe("");
  });

  it("preserves q and id from existing params", () => {
    const existing = new URLSearchParams("q=parking&id=abc123");
    const params = serializeSearchFilters(
      { time: "month", types: [], sort: "" },
      existing,
    );
    expect(params.get("q")).toBe("parking");
    expect(params.get("id")).toBe("abc123");
    expect(params.get("time")).toBe("month");
  });

  it("handles multiple types", () => {
    const params = serializeSearchFilters({
      time: "",
      types: ["motion", "key_statement", "document_section"],
      sort: "",
    });
    expect(params.getAll("type")).toEqual([
      "motion",
      "key_statement",
      "document_section",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: parse -> serialize -> parse
// ---------------------------------------------------------------------------

describe("round-trip", () => {
  it("preserves filter state through serialize -> parse", () => {
    const original = {
      time: "week",
      types: ["motion", "document_section"] as const,
      sort: "newest",
    };
    const serialized = serializeSearchFilters(original);
    const parsed = parseSearchFilters(serialized);
    expect(parsed).toEqual(original);
  });

  it("preserves defaults through serialize -> parse", () => {
    const original = { time: "", types: [] as const, sort: "" };
    const serialized = serializeSearchFilters(original);
    const parsed = parseSearchFilters(serialized);
    expect(parsed).toEqual(original);
  });
});
