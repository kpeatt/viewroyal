/**
 * Cursor-based pagination utilities.
 *
 * Encodes/decodes opaque base64 cursors that wrap a sort-column value + row ID
 * for keyset pagination.  All list endpoints use these helpers so that
 * consumers never need to understand the cursor internals.
 */

interface CursorPayload {
  /** The value of the sort column for the last row */
  v: string | number;
  /** The row ID for tiebreaking */
  id: number;
}

/**
 * Base64-encode a cursor payload (sort value + row ID).
 */
export function encodeCursor(payload: CursorPayload): string {
  return btoa(JSON.stringify(payload));
}

/**
 * Decode a base64 cursor string back into its payload.
 * Returns null if the cursor is malformed.
 */
export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    return JSON.parse(atob(cursor));
  } catch {
    return null;
  }
}

/**
 * Given rows fetched with `per_page + 1` limit, slice to `per_page`,
 * determine `has_more`, and build the `next_cursor` from the last row.
 */
export function extractPage<T extends { id: number }>(
  rows: T[],
  perPage: number,
  sortKey: keyof T,
): {
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
} {
  const has_more = rows.length > perPage;
  const data = has_more ? rows.slice(0, perPage) : rows;
  const last = data[data.length - 1];

  return {
    data,
    has_more,
    next_cursor: last
      ? encodeCursor({ v: last[sortKey] as string | number, id: last.id })
      : null,
  };
}
