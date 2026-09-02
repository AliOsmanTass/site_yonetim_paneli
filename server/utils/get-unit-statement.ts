// Bir dairenin tam ekstresi — borçlar, kalemler, ödemeler ve o anki tazminat.

import { eq, tables, type Database } from './drizzle'
import { calculatePenalty, roundCurrency } from './penalty'
import { buildStatement, type StatementDebtEvent, type StatementItem, type StatementPaymentEvent } from './statement'
import { getOpenDebtsForUnit } from './open-debts'
import { getRateSegments } from './rate-segments'

// Bir dairenin ekstre satırlarını ve özet toplamlarını (canlı tazminat dahil) hazırlar.
export async function getUnitStatementData(db: Database, unitId: number) {
  const debts: (typeof tables.debts.$inferSelect)[] = await db.select().from(tables.debts).where(eq(tables.debts.unitId, unitId)).orderBy(tables.debts.documentDate)

  const debtTypeRows: { id: number; name: string }[] = await db.select({ id: tables.debtTypes.id, name: tables.debtTypes.name }).from(tables.debtTypes)
  const debtTypeNameById = new Map(debtTypeRows.map((t) => [t.id, t.name]))

  const itemRows: { debtId: number; description: string; quantity: number; unitPrice: number; lineTotal: number }[] = await db
    .select({
      debtId: tables.debtItems.debtId,
      description: tables.debtItems.description,
      quantity: tables.debtItems.quantity,
      unitPrice: tables.debtItems.unitPrice,
      lineTotal: tables.debtItems.lineTotal
    })
    .from(tables.debtItems)
    .innerJoin(tables.debts, eq(tables.debtItems.debtId, tables.debts.id))
    .where(eq(tables.debts.unitId, unitId))

  const itemsByDebt = new Map<number, StatementItem[]>()
  for (const item of itemRows) {
    const list = itemsByDebt.get(item.debtId) ?? []
    list.push({ description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal })
    itemsByDebt.set(item.debtId, list)
  }

  const payments: (typeof tables.payments.$inferSelect)[] = await db.select().from(tables.payments).where(eq(tables.payments.unitId, unitId)).orderBy(tables.payments.paidAt)

  const allocationRows: { paymentId: number; penaltyAmount: number }[] = await db
    .select({ paymentId: tables.paymentAllocations.paymentId, penaltyAmount: tables.paymentAllocations.penaltyAmount })
    .from(tables.paymentAllocations)
    .innerJoin(tables.payments, eq(tables.paymentAllocations.paymentId, tables.payments.id))
    .where(eq(tables.payments.unitId, unitId))

  const penaltyByPayment = new Map<number, number>()
  for (const row of allocationRows) {
    penaltyByPayment.set(row.paymentId, roundCurrency((penaltyByPayment.get(row.paymentId) ?? 0) + row.penaltyAmount))
  }

  const debtEvents: StatementDebtEvent[] = debts.map((d) => ({
    kind: 'debt',
    debtId: d.id,
    documentDate: d.documentDate,
    dueDate: d.dueDate,
    title: d.title,
    documentNo: d.documentNo,
    amount: d.amount,
    debtTypeName: debtTypeNameById.get(d.debtTypeId),
    items: itemsByDebt.get(d.id)
  }))

  const paymentEvents: StatementPaymentEvent[] = payments.map((p) => ({
    kind: 'payment',
    paymentId: p.id,
    paidAt: p.paidAt,
    receiptNo: p.receiptNo,
    account: p.account,
    amount: p.amount,
    penaltyAmount: penaltyByPayment.get(p.id) ?? 0
  }))

  const { rows, totals } = buildStatement([...debtEvents, ...paymentEvents])

  // Hâlâ açık olan borçların, bugüne kadar biriken (henüz sabitlenmemiş)
  // tazminatı — hem toplam kart için hem de ekstre satırlarında hangi borcun
  // açık tazminatı olduğunu göstermek için tek yerde hesaplanıyor.
  const openDebts = await getOpenDebtsForUnit(db, unitId)
  const rateSegments = await getRateSegments(db)
  const today = new Date().toISOString().slice(0, 10)

  const openPenaltyByDebt = new Map<number, number>()
  for (const d of openDebts) {
    const remaining = d.amount - d.allocated
    if (remaining <= 0) continue
    const { amount } = calculatePenalty({ principal: remaining, penaltyStartDate: d.penaltyStartDate, asOfDate: today, rateSegments })
    if (amount > 0) openPenaltyByDebt.set(d.id, amount)
  }
  const liveOpenPenalty = roundCurrency([...openPenaltyByDebt.values()].reduce((sum, a) => sum + a, 0))

  // Ekstredeki borç satırlarına, o borcun açık (henüz sabitlenmemiş) tazminatı
  // varsa Tazminat sütununda gösterilmek üzere ekleniyor.
  for (const row of rows) {
    if (row.kind !== 'debt') continue
    const amount = openPenaltyByDebt.get(row.id)
    if (amount) row.penaltyAmount = amount
  }

  // "Tazminat" kartı bilerek sadece henüz sabitlenmemiş, hâlâ canlı işleyen
  // tutarı gösteriyor — geçmişte sabitlenmiş tazminat (totals.penalty) artık
  // kendi Tazminat borcu olarak Toplam Borç'a girdiği için burada tekrar
  // sayılmıyor, aynı tutar iki kartta birden görünmesin diye.
  return {
    summary: {
      totalDebt: totals.debt,
      totalPenalty: liveOpenPenalty,
      totalPaid: totals.payment,
      balance: roundCurrency(totals.balance + liveOpenPenalty)
    },
    rows
  }
}
