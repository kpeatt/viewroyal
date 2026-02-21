/**
 * OpenStates-style response envelope builders for OCD endpoints.
 *
 * OCD list responses use `{ results, pagination }` -- distinct from the v1
 * API envelope `{ data, pagination, meta }` in `apps/web/app/api/lib/envelope.ts`.
 *
 * OCD detail responses return the entity directly at the top level (no wrapper),
 * matching the OpenStates convention.
 */

import type { Context } from "hono";
import type { OcdPagination } from "./pagination";

/**
 * Wrap a paginated list of OCD entities in the OpenStates-style envelope.
 *
 * Shape: `{ results: T[], pagination: OcdPagination }`
 */
export function ocdListResponse<T>(
  c: Context,
  results: T[],
  pagination: OcdPagination,
) {
  return c.json({ results, pagination });
}

/**
 * Return a single OCD entity directly (no wrapper object).
 *
 * OpenStates detail endpoints return the entity at the top level, e.g.
 * `{ "id": "ocd-person/...", "name": "...", ... }` rather than
 * `{ "data": { ... } }`.
 */
export function ocdDetailResponse<T>(c: Context, result: T) {
  return c.json(result);
}
