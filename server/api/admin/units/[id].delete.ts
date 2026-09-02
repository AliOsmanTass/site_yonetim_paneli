// Borcu ya da ödeme kaydı olan bir daire silinemez. Mülkiyet değişikliğinde
// eski borcu taşımak için sanal daire mekanizması kullanılıyor
export default defineEventHandler(async (event) => {
  await requireAdminWriteAccess(event)
  const id = Number(getRouterParam(event, 'id'))

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Geçersiz daire id.' })
  }

  const db = useDrizzle()
  const [debtRef] = await db.select({ id: tables.debts.id }).from(tables.debts).where(eq(tables.debts.unitId, id)).limit(1)
  const [paymentRef] = await db.select({ id: tables.payments.id }).from(tables.payments).where(eq(tables.payments.unitId, id)).limit(1)

  if (debtRef || paymentRef) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Bu dairede borç/ödeme kaydı var, silinemez.'
    })
  }

  await db.delete(tables.units).where(eq(tables.units.id, id))
  return { success: true }
})
