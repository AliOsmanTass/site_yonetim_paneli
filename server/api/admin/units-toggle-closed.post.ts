// Sanal dairenin hesabını kapatır/açar. Sadece sanal dairelerde kullanılır —
// kapalıyken o daireye yeni borç/ödeme eklenemez (bkz. debts.post.ts,
// units/[unitId]/payments.post.ts).
interface ToggleClosedPayload {
  unitId: number
  closed: boolean
}

export default defineEventHandler(async (event) => {
  await requireAdminWriteAccess(event)
  const body = await readBody<ToggleClosedPayload>(event)

  if (!body.unitId || typeof body.closed !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'Daire ve durum gerekli.' })
  }

  const db = useDrizzle()
  const [unit] = await db.select().from(tables.units).where(eq(tables.units.id, body.unitId))
  if (!unit) {
    throw createError({ statusCode: 404, statusMessage: 'Daire bulunamadı.' })
  }
  if (!unit.isVirtual) {
    throw createError({ statusCode: 400, statusMessage: 'Sadece sanal daireler kapatılabilir.' })
  }

  await db.update(tables.units).set({ isClosed: body.closed }).where(eq(tables.units.id, body.unitId))
  return { success: true }
})
