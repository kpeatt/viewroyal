/**
 * Response envelope builders.
 *
 * All API responses are wrapped in a consistent envelope shape:
 *   - List:   { data, pagination, meta }
 *   - Detail: { data, meta }
 *
 * Field names use snake_case to match database columns and civic API conventions.
 * Null fields are always included (never omitted).
 */

import type { Context } from "hono";
import type { ApiEnv } from "../types";

interface PaginationInfo {
  has_more: boolean;
  next_cursor: string | null;
  per_page: number;
}

/**
 * Wrap a paginated list of items in the standard envelope.
 */
export function listResponse<T>(
  c: Context<ApiEnv>,
  data: T[],
  pagination: PaginationInfo,
) {
  return c.json({
    data,
    pagination,
    meta: {
      request_id: c.get("requestId"),
    },
  });
}

/**
 * Wrap a single item in the standard envelope.
 */
export function detailResponse<T>(c: Context<ApiEnv>, data: T) {
  return c.json({
    data,
    meta: {
      request_id: c.get("requestId"),
    },
  });
}
