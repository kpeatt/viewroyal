import type { Municipality } from "./types";

/**
 * Extracts municipality data from route matches (for use in meta functions).
 * Reads from the root loader data which always includes municipality.
 */
export function getMunicipalityFromMatches(
  matches: readonly (
    | { id: string; data?: unknown }
    | undefined
  )[],
): Municipality | undefined {
  const rootMatch = matches.find(
    (m): m is { id: string; data?: unknown } =>
      m != null && m.id === "root",
  );
  const data = rootMatch?.data as Record<string, unknown> | undefined;
  return data?.municipality as Municipality | undefined;
}
