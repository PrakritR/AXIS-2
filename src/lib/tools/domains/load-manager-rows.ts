import type { AgentContext } from "../context";

const PAGE_SIZE = 1000;

/**
 * Load the complete set of a landlord's records from a portal table, scoped by
 * manager_user_id and paginated by a stable column so nothing is silently
 * truncated. Ordering by the table's primary key keeps each page deterministic,
 * which is what makes the range loop complete (no skipped or duplicated rows)
 * regardless of how many records the landlord has.
 */
export async function loadAllManagerRows<T>(
  ctx: AgentContext,
  table: string,
  map: (rowData: unknown) => T,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await ctx.db
      .from(table)
      .select("row_data")
      .eq("manager_user_id", ctx.landlordId)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { row_data: unknown }[];
    for (const r of rows) out.push(map(r.row_data));
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}
