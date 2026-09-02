// Yeni ödeme girişi. confirm gönderilmezse ya da false ise sadece mahsup
// önizlemesi döner, hiçbir şey kaydedilmez 
import { roundCurrency } from '../../../../utils/penalty'
import { notifyPayment } from '../../../../utils/notifications'
import { ensureSystemDebtTypes } from '../../../../utils/debt-types'

interface PaymentPayload {
  paidAt: string
  amount: number
  account: string
  reference?: string
  note?: string
  confirm?: boolean
}

export default defineEventHandler(async (event) => {
  const session = await requireAdminWriteAccess(event)
  const unitId = Number(getRouterParam(event, 'unitId'))
  const body = await readBody<PaymentPayload>(event)

  if (!unitId || !body.paidAt || !body.amount || body.amount <= 0 || !body.account?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Tahsilat tarihi, tutar ve kasa/hesap gerekli.' })
  }

  const db = useDrizzle()
  const openDebts = await getOpenDebtsForUnit(db, unitId)
  const rateSegments = await getRateSegments(db)

  const forAllocation = openDebts
    .map((d) => ({ debtId: d.id, remainingPrincipal: d.amount - d.allocated, penaltyStartDate: d.penaltyStartDate }))
    .filter((d) => d.remainingPrincipal > 0)

  const totalOpenPrincipal = roundCurrency(forAllocation.reduce((sum, d) => sum + d.remainingPrincipal, 0))
  if (body.amount > totalOpenPrincipal) {
    throw createError({
      statusCode: 400,
      statusMessage: `Girilen tutar (${body.amount.toFixed(2)} ₺) toplam açık borçtan (${totalOpenPrincipal.toFixed(2)} ₺) fazla olamaz.`
    })
  }

  const { allocations, unallocatedAmount } = allocatePayment({
    amount: body.amount,
    paidAt: body.paidAt,
    openDebts: forAllocation,
    rateSegments
  })

  const allocationsWithTitle = allocations.map((a) => ({
    ...a,
    debtTitle: openDebts.find((d) => d.id === a.debtId)?.title ?? ''
  }))

  if (!body.confirm) {
    return { preview: true, allocations: allocationsWithTitle, unallocatedAmount }
  }

  const documentNo = await nextDocumentNo(db)
  const [payment] = await db
    .insert(tables.payments)
    .values({
      unitId,
      receiptNo: documentNo,
      paidAt: body.paidAt,
      amount: body.amount,
      account: body.account.trim(),
      reference: body.reference || null,
      note: body.note || null,
      createdBy: session.user.id
    })
    .returning({ id: tables.payments.id })

  // İşlemiş tazminatı ayrı, gerçek bir borca çeviren "Tazminat" türü — sadece
  // ilk kez lazım olduğunda oluşturuluyor
  let tazminatTypeId: number | null = null
  async function getTazminatTypeId(): Promise<number> {
    if (tazminatTypeId) return tazminatTypeId
    await ensureSystemDebtTypes(db)
    const [tazminatType] = await db.select({ id: tables.debtTypes.id }).from(tables.debtTypes).where(eq(tables.debtTypes.name, 'Tazminat'))
    tazminatTypeId = tazminatType.id
    return tazminatType.id
  }

  for (const allocation of allocations) {
    await db.insert(tables.paymentAllocations).values({
      paymentId: payment.id,
      debtId: allocation.debtId,
      principalAmount: allocation.principalAmount,
      penaltyAmount: allocation.penaltyAmount,
      penaltyDays: allocation.penaltyDays
    })

    const debtRow = openDebts.find((d) => d.id === allocation.debtId)!
    const newRemaining = debtRow.amount - debtRow.allocated - allocation.principalAmount
    await db
      .update(tables.debts)
      .set({ status: newRemaining <= 0 ? 'paid' : 'partial' })
      .where(eq(tables.debts.id, allocation.debtId))

    // İşlemiş tazminat, bilgi amaçlı bir rakam olarak kalmıyor — kendi başına
    // yeni, gerçek bir borç olarak açılıyor ama tazminat borçlarının tazminatı yok
    
    if (allocation.penaltyAmount > 0) {
      const tazminatDocumentNo = await nextDocumentNo(db)
      await db.insert(tables.debts).values({
        unitId,
        debtTypeId: await getTazminatTypeId(),
        title: `${debtRow.title} — Gecikme Tazminatı`,
        period: null,
        documentNo: tazminatDocumentNo,
        documentDate: body.paidAt,
        dueDate: body.paidAt,
        penaltyStartDate: null,
        amount: allocation.penaltyAmount,
        installmentNo: null,
        installmentTotal: null,
        status: 'open',
        sourcePaymentId: payment.id
      })
    }
  }

  // Her tahsilat aynı anda kasaya gelir olarak işlenir.
  await db.insert(tables.cashTransactions).values({
    direction: 'in',
    amount: body.amount,
    transactionDate: body.paidAt,
    paymentId: payment.id,
    description: `Tahsilat · ${body.account.trim()}`
  })

  await notifyPayment(db, unitId, body.amount, body.paidAt)

  return { preview: false, paymentId: payment.id, allocations: allocationsWithTitle, unallocatedAmount }
})
