import { sql, tables, type Database } from './drizzle'

// Sıradaki evrak numarasını üretir.
export async function nextDocumentNo(db: Database): Promise<string> {
  const [row] = await db
    .select({ maxNo: sql<number | null>`MAX(CAST(${tables.debts.documentNo} AS INTEGER))` })
    .from(tables.debts)
  return String((row?.maxNo ?? 9999) + 1)
}
