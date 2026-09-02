// Site ayarlarını oluşturur/günceller. 
interface SiteSettingsPayload {
  siteName: string
  siteDescription?: string | null
  monthlyFee: number
  dueDayStart: number
  dueDayEnd: number
  latePenaltyMonthlyRate: number
  managerStipend?: number | null
  managerUnitId?: number | null
  assistantStipend?: number | null
  assistantUnitId?: number | null
}

export default defineEventHandler(async (event) => {
  const session = await requireAdminWriteAccess(event)
  const body = await readBody<SiteSettingsPayload>(event)

  if (!body.siteName || !body.monthlyFee || !body.dueDayStart || !body.dueDayEnd || body.latePenaltyMonthlyRate == null) {
    throw createError({ statusCode: 400, statusMessage: 'Eksik alan: site adı, aidat tutarı, ödeme aralığı ve tazminat oranı zorunlu.' })
  }

  const db = useDrizzle()
  const today = new Date().toISOString().slice(0, 10)
  const values = {
    siteName: body.siteName,
    siteDescription: body.siteDescription ?? null,
    monthlyFee: body.monthlyFee,
    dueDayStart: body.dueDayStart,
    dueDayEnd: body.dueDayEnd,
    latePenaltyMonthlyRate: body.latePenaltyMonthlyRate,
    managerStipend: body.managerStipend ?? null,
    managerUnitId: body.managerUnitId ?? null,
    assistantStipend: body.assistantStipend ?? null,
    assistantUnitId: body.assistantUnitId ?? null
  }

  const [existing] = await db.select().from(tables.siteSettings).where(eq(tables.siteSettings.id, 1))

  if (!existing) {
    await db.insert(tables.siteSettings).values({ id: 1, ...values })
    await db.insert(tables.settingHistory).values({
      key: 'late_penalty_monthly_rate',
      value: String(body.latePenaltyMonthlyRate),
      effectiveFrom: today,
      changedBy: session.user.id
    })
  } else {
    if (existing.latePenaltyMonthlyRate !== body.latePenaltyMonthlyRate) {
      await db.insert(tables.settingHistory).values({
        key: 'late_penalty_monthly_rate',
        value: String(body.latePenaltyMonthlyRate),
        effectiveFrom: today,
        changedBy: session.user.id
      })
    }
    await db.update(tables.siteSettings).set(values).where(eq(tables.siteSettings.id, 1))
  }

  const [updated] = await db.select().from(tables.siteSettings).where(eq(tables.siteSettings.id, 1))
  return updated
})
