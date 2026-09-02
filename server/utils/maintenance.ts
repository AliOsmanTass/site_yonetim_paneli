// Askı süresi dolan aktif duyuruları arşive taşır.
import { and, eq, lt, tables, type Database } from './drizzle'

export interface DailyMaintenanceResult {
  archived: number
}

export async function runDailyMaintenance(db: Database, referenceDate: string): Promise<DailyMaintenanceResult> {
  const result = await db
    .update(tables.announcements)
    .set({ status: 'archived' })
    .where(and(eq(tables.announcements.status, 'active'), lt(tables.announcements.expiresAt, referenceDate)))
    .returning({ id: tables.announcements.id })

  return { archived: result.length }
}
