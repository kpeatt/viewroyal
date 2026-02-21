/**
 * Page-based pagination utilities for OCD list endpoints.
 *
 * Matches the OpenStates v3 pagination convention:
 *   - Query params: `page` (default 1) + `per_page` (default 20, max 100)
 *   - Response:     `{ pagination: { page, per_page, max_page, total_items } }`
 *
 * This is intentionally separate from the cursor-based pagination used by
 * the v1 API endpoints (`apps/web/app/api/lib/cursor.ts`).
 */

import type { Context } from "hono";

/** Pagination metadata included in every OCD list response. */
export interface OcdPagination {
  page: number;
  per_page: number;
  max_page: number;
  total_items: number;
}

/**
 * Parse `page` and `per_page` from query parameters.
 *
 * - `page`:     default 1, min 1.  Non-numeric values fall back to 1.
 * - `per_page`: default 20, min 1, max 100.  Clamped to bounds.
 *
 * Returns integers suitable for offset/limit computation.
 */
export function parsePaginationParams(c: Context): {
  page: number;
  perPage: number;
} {
  const rawPage = c.req.query("page");
  const rawPerPage = c.req.query("per_page");

  let page = rawPage ? parseInt(rawPage, 10) : 1;
  if (!Number.isFinite(page) || page < 1) {
    page = 1;
  }

  let perPage = rawPerPage ? parseInt(rawPerPage, 10) : 20;
  if (!Number.isFinite(perPage) || perPage < 1) {
    perPage = 1;
  } else if (perPage > 100) {
    perPage = 100;
  }

  return { page, perPage };
}

/**
 * Compute pagination metadata from a total item count.
 *
 * `max_page` is always at least 1 (even for empty result sets) to match
 * the OpenStates convention where page 1 is valid even with zero results.
 */
export function computePagination(
  total: number,
  page: number,
  perPage: number,
): OcdPagination {
  return {
    page,
    per_page: perPage,
    max_page: Math.max(1, Math.ceil(total / perPage)),
    total_items: total,
  };
}
