/**
 * Motion result normalization utilities.
 *
 * Maps the 11 raw motion result values from the database
 * to 4 display categories with consistent styling.
 */

export type MotionOutcome = "passed" | "failed" | "tabled" | "withdrawn";

/**
 * Maps uppercase raw result strings to their normalized outcome category.
 */
export const RESULT_MAP: Record<string, MotionOutcome> = {
  CARRIED: "passed",
  "CARRIED AS AMENDED": "passed",
  AMENDED: "passed",
  CARRRIED: "passed", // known typo in database
  DEFEATED: "failed",
  FAILED: "failed",
  "FAILED FOR LACK OF A SECONDER": "failed",
  "FAILED FOR LACK OF SECONDER": "failed",
  "NOT CARRIED": "failed",
  TABLED: "tabled",
  WITHDRAWN: "withdrawn",
};

/**
 * Normalizes a raw motion result string to a display-friendly outcome.
 *
 * Case-insensitive, trims whitespace, returns null for unknown/missing values.
 */
export function normalizeMotionResult(
  result: string | null | undefined,
): MotionOutcome | null {
  if (result == null) return null;
  const normalized = result.trim().toUpperCase();
  if (normalized === "") return null;
  return RESULT_MAP[normalized] ?? null;
}

/**
 * Tailwind class strings for each outcome category.
 * Used by MotionOutcomeBadge and anywhere badges appear.
 */
export const OUTCOME_STYLES: Record<MotionOutcome, string> = {
  passed: "bg-green-100 text-green-700 border-green-200",
  failed: "bg-red-100 text-red-700 border-red-200",
  tabled: "bg-yellow-100 text-yellow-700 border-yellow-200",
  withdrawn: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

/**
 * Human-readable labels for each outcome category.
 */
export const OUTCOME_LABELS: Record<MotionOutcome, string> = {
  passed: "Passed",
  failed: "Failed",
  tabled: "Tabled",
  withdrawn: "Withdrawn",
};
