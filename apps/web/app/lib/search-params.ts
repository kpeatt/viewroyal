/**
 * Search filter URL parameter utilities.
 *
 * Handles time range calculation, URL param serialization/deserialization,
 * and content type/sort options for keyword search.
 */

import type { UnifiedSearchResult } from "../services/hybrid-search.server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContentType = UnifiedSearchResult["type"];

export interface SearchFilters {
  time: string;
  types: ContentType[];
  sort: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TIME_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "week", label: "Past week" },
  { value: "month", label: "Past month" },
  { value: "year", label: "Past year" },
] as const;

export const SORT_OPTIONS = [
  { value: "", label: "Relevance" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
] as const;

export const TYPE_OPTIONS: Array<{
  value: ContentType;
  label: string;
}> = [
  { value: "motion", label: "Motions" },
  { value: "key_statement", label: "Key Statements" },
  { value: "document_section", label: "Documents" },
  { value: "transcript_segment", label: "Transcripts" },
];

// ---------------------------------------------------------------------------
// Date range calculation
// ---------------------------------------------------------------------------

/**
 * Convert a time range key to date boundaries (YYYY-MM-DD).
 * Returns { from: null, to: null } for empty/unknown values.
 */
export function getDateRange(timeRange: string): {
  from: string | null;
  to: string | null;
} {
  if (!timeRange || !["week", "month", "year"].includes(timeRange)) {
    return { from: null, to: null };
  }

  const now = new Date();
  const to = formatDate(now);

  const from = new Date(now);
  switch (timeRange) {
    case "week":
      from.setDate(from.getDate() - 7);
      break;
    case "month":
      from.setMonth(from.getMonth() - 1);
      break;
    case "year":
      from.setFullYear(from.getFullYear() - 1);
      break;
  }

  return { from: formatDate(from), to };
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// URL param parsing / serialization
// ---------------------------------------------------------------------------

const VALID_TYPES: ContentType[] = [
  "motion",
  "key_statement",
  "document_section",
  "transcript_segment",
];

/**
 * Parse search filter state from URL search params.
 * Missing/default values return empty string/empty array.
 */
export function parseSearchFilters(searchParams: URLSearchParams): SearchFilters {
  const time = searchParams.get("time") || "";
  const sort = searchParams.get("sort") || "";
  const rawTypes = searchParams.getAll("type");
  const types = rawTypes.filter((t): t is ContentType =>
    VALID_TYPES.includes(t as ContentType),
  );

  return { time, types, sort };
}

/**
 * Serialize filter state to URL params.
 * Omits default values (empty time, empty types, empty sort) for clean URLs.
 * Preserves `q` and `id` params if existingParams provided.
 */
export function serializeSearchFilters(
  filters: SearchFilters,
  existingParams?: URLSearchParams,
): URLSearchParams {
  const params = new URLSearchParams();

  // Preserve q and id from existing params
  if (existingParams) {
    const q = existingParams.get("q");
    if (q) params.set("q", q);
    const id = existingParams.get("id");
    if (id) params.set("id", id);
  }

  // Only add non-default values
  if (filters.time) {
    params.set("time", filters.time);
  }

  for (const type of filters.types) {
    params.append("type", type);
  }

  if (filters.sort) {
    params.set("sort", filters.sort);
  }

  return params;
}
