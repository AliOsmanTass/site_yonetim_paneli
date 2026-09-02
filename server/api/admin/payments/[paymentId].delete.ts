// Bir dairenin sadece en son girilen ödemesi silinebilir. Daha sonraki bir
// ödeme varsa, onun FIFO mahsubu bu ödemenin kapattığı borçlara göre
// hesaplanmış olabilir — araya girip silmek geçmişi tutarsız bırakır.
//
// Silme sırasında: mahsup kayıtları kaldırılır, etkilenen borçların durumu
// (kalan diğer ödemelere göre) yeniden hesaplanır, kasa kaydı ve ödemenin
// kendisi silinir.
export default defineEventHandler(async (event) => {
  await requireAdminWriteAccess(event)
  const paymentId = Number(getRouterParam(event, 'paymentId'))
  if (!paymentId) {
    throw createError({ statusCode: 400, statusMessage: 'Geçersiz ödeme id.' })
  }

  const db = useDrizzle()

  const [payment] = await db.select().from(tables.payments).where(eq(tables.payments.id, paymentId))
  if (!payment) {
    throw createError({ statusCode: 404, statusMessage: 'Ödeme bulunamadı.' })
  }

  const [laterPayment] = await db
    .select({ id: tables.payments.id })
    .from(tables.payments)
    .where(and(eq(tables.payments.unitId, payment.unitId), gt(tables.payments.id, paymentId)))
    .limit(1)
  if (laterPayment) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Bu ödemeden sonra başka ödeme girilmiş, yalnızca en son ödeme silinebilir.'
    })
  }

  const allocations = await db.select().from(tables.paymentAllocations).where(eq(tables.paymentAllocations.paymentId, paymentId))

  await db.delete(tables.paymentAllocations).where(eq(tables.paymentAllocations.paymentId, paymentId))

  for (const allocation of allocations) {
    const [debt] = await db.select().from(tables.debts).where(eq(tables.debts.id, allocation.debtId))
    if (!debt) continue

    const [{ remaining }] = await db
      .select({ remaining: sql<number>`COALESCE(SUM(${tables.paymentAllocations.principalAmount}), 0)` })
      .from(tables.paymentAllocations)
      .where(eq(tables.paymentAllocations.debtId, allocation.debtId))

    const status = remaining <= 0 ? 'open' : remaining >= debt.amount ? 'paid' : 'partial'
    await db.update(tables.debts).set({ status }).where(eq(tables.debts.id, allocation.debtId))
  }

  // Bu ödemenin ürettiği tazminat borçları da (varsa) siliniyor — onlar bu
  // ödemenin bir sonucuydu, ödeme geri alınınca geçerliliklerini kaybederler.
 
  await db.delete(tables.debts).where(eq(tables.debts.sourcePaymentId, paymentId))

  await db.delete(tables.cashTransactions).where(eq(tables.cashTransactions.paymentId, paymentId))
  await db.delete(tables.payments).where(eq(tables.payments.id, paymentId))

  return { success: true }
})
