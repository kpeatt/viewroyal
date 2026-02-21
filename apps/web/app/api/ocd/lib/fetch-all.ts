/**
 * Fetch all rows from a Supabase table, paginating past PostgREST's max-rows limit (1000).
 *
 * PostgREST silently caps `.limit()` at its configured `max-rows` (1000 on Supabase).
 * This helper fetches in batches using `.range()` until all rows are retrieved.
 */

const BATCH_SIZE = 1000;

/**
 * Fetch all rows matching a query by paginating in batches.
 *
 * Usage:
 * ```ts
 * const rows = await fetchAll(supabase, "matters", "id, title", (q) =>
 *   q.eq("municipality_id", muni.id)
 * );
 * ```
 */
export async function fetchAll<T = any>(
  supabase: any,
  table: string,
  select: string,
  applyFilters?: (query: any) => any,
): Promise<T[]> {
  const allRows: T[] = [];
  let offset = 0;

  while (true) {
    let query = supabase
      .from(table)
      .select(select)
      .range(offset, offset + BATCH_SIZE - 1);

    if (applyFilters) {
      query = applyFilters(query);
    }

    const { data, error } = await query;

    if (error) throw error;

    const rows = data ?? [];
    allRows.push(...rows);

    if (rows.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  return allRows;
}
