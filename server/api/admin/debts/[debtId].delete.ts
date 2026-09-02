// Ödeme yapılmış bir borç silinemez — silersek hesap geçmişi tutarsız kalır.
export default defineEventHandler(async (event) => {
  await requireAdminWriteAccess(event)
  const debtId = Number(getRouterParam(event, 'debtId'))
  if (!debtId) {
    throw createError({ statusCode: 400, statusMessage: 'Geçersiz borç id.' })
  }

  const db = useDrizzle()

  const [allocationRef] = await db
    .select({ id: tables.paymentAllocations.id })
    .from(tables.paymentAllocations)
    .where(eq(tables.paymentAllocations.debtId, debtId))
    .limit(1)
  if (allocationRef) {
    throw createError({ statusCode: 409, statusMessage: 'Bu borca ödeme yapılmış, silinemez.' })
  }

  await db.delete(tables.debtItems).where(eq(tables.debtItems.debtId, debtId))
  await db.delete(tables.debts).where(eq(tables.debts.id, debtId))

  return { success: true }
})
