// Düzenleme formunu doldurmak için tek bir borcun kaydı + kalemleri.
export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const debtId = Number(getRouterParam(event, 'debtId'))
  if (!debtId) {
    throw createError({ statusCode: 400, statusMessage: 'Geçersiz borç id.' })
  }

  const db = useDrizzle()
  const [debt] = await db.select().from(tables.debts).where(eq(tables.debts.id, debtId))
  if (!debt) {
    throw createError({ statusCode: 404, statusMessage: 'Borç bulunamadı.' })
  }

  const items = await db
    .select({
      description: tables.debtItems.description,
      quantity: tables.debtItems.quantity,
      unitPrice: tables.debtItems.unitPrice,
      lineTotal: tables.debtItems.lineTotal
    })
    .from(tables.debtItems)
    .where(eq(tables.debtItems.debtId, debtId))

  return { ...debt, items }
})
