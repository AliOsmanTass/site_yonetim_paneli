// site_settings ve setting_history'den, calculatePenalty'nin ihtiyaç
// duyduğu boşluksuz oran segment listesini üretir.
import { eq, tables, type Database } from './drizzle'
import { buildRateSegments, type RateSegment } from './penalty'

const RATE_KEY = 'late_penalty_monthly_rate'

export async function getRateSegments(db: Database): Promise<RateSegment[]> {
  const history: (typeof tables.settingHistory.$inferSelect)[] = await db.select().from(tables.settingHistory).where(eq(tables.settingHistory.key, RATE_KEY))
  const points = history.map((h) => ({ rate: Number(h.value), effectiveFrom: h.effectiveFrom }))

  if (points.length === 0) {
    const [settings] = await db.select().from(tables.siteSettings).where(eq(tables.siteSettings.id, 1))
    if (!settings) return []
    points.push({ rate: settings.latePenaltyMonthlyRate, effectiveFrom: '2000-01-01' })
  }

  return buildRateSegments(points)
}
