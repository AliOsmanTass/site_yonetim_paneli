// Aylık aidat tahakkuku + huzur hakkı.
import { and, eq, tables, type Database } from './drizzle'
import { allocatePayment, type OpenDebtForAllocation } from './allocation'
import { nextDocumentNo } from './document-no'
import { getOpenDebtsForUnit } from './open-debts'
import { getRateSegments } from './rate-segments'

const TURKISH_MONTHS = [
  'OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN',
  'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'
]

// Bir tarihe gün ekler.
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Tarihten "YYYY-MM" dönemini çıkarır.
function periodOf(date: string): string {
  return date.slice(0, 7)
}

export interface MonthlyAccrualResult {
  accrued: number
  skipped: number
  stipendsProcessed: number
}

// Tüm gerçek dairelere o ayın aidat borcunu yazar, ardından huzur hakkını işler.
export async function runMonthlyAccrual(db: Database, referenceDate: string): Promise<MonthlyAccrualResult> {
  const [settings] = await db.select().from(tables.siteSettings).where(eq(tables.siteSettings.id, 1))
  if (!settings) throw new Error('site_settings satırı bulunamadı (seed eksik)')

  const [aidatType] = await db.select().from(tables.debtTypes).where(eq(tables.debtTypes.name, 'Aidat'))
  if (!aidatType) throw new Error("'Aidat' debt_type bulunamadı (seed eksik)")

  const period = periodOf(referenceDate)
  const dueDate = `${period}-${String(settings.dueDayEnd).padStart(2, '0')}`
  const penaltyStartDate = addDays(dueDate, 1)
  const [year, month] = period.split('-')
  const title = `${year}/${TURKISH_MONTHS[Number(month) - 1]} DÖNEMİ AİDAT BEDELİ`

  const units = await db.select().from(tables.units).where(eq(tables.units.isVirtual, false))

  let accrued = 0
  let skipped = 0

  for (const unit of units) {
    const documentNo = await nextDocumentNo(db)
    const inserted = await db
      .insert(tables.debts)
      .values({
        unitId: unit.id,
        debtTypeId: aidatType.id,
        title,
        period,
        documentNo,
        documentDate: referenceDate,
        dueDate,
        penaltyStartDate,
        amount: settings.monthlyFee,
        // Taksitsiz borçlarda installment_no'yu NULL yerine 0 yazıyoruz.

        installmentNo: 0,
        status: 'open'
      })
      .onConflictDoNothing({
        target: [tables.debts.unitId, tables.debts.debtTypeId, tables.debts.period, tables.debts.installmentNo]
      })
      .returning({ id: tables.debts.id })

    if (inserted.length > 0) accrued++
    else skipped++
  }

  const stipendsProcessed = await processStipends(db, settings, referenceDate)

  return { accrued, skipped, stipendsProcessed }
}

// Huzur hakkı tanımlıysa kasa gideri yazar; alıcı bir dairenin sahibiyse borcundan düşer.
async function processStipends(
  db: Database,
  settings: typeof tables.siteSettings.$inferSelect,
  referenceDate: string
): Promise<number> {
  const existingStipends = await db
    .select({ title: tables.expenses.title })
    .from(tables.expenses)
    .where(and(eq(tables.expenses.type, 'stipend'), eq(tables.expenses.expenseDate, referenceDate)))
  const alreadyProcessed = new Set(existingStipends.map((e: { title: string }) => e.title))

  const stipends: { title: string; amount: number | null; unitId: number | null }[] = [
    { title: 'Huzur Hakkı — Yönetici', amount: settings.managerStipend, unitId: settings.managerUnitId },
    { title: 'Huzur Hakkı — Yardımcı Yönetici', amount: settings.assistantStipend, unitId: settings.assistantUnitId }
  ]

  let processed = 0

  for (const stipend of stipends) {
    if (!stipend.amount || stipend.amount <= 0) continue
    // cron aynı gün ikinci kez çalışırsa tekrar işlemesin diye burada elle kontrol ediyoruz.
    if (alreadyProcessed.has(stipend.title)) continue

    const [expense] = await db
      .insert(tables.expenses)
      .values({ type: 'stipend', title: stipend.title, expenseDate: referenceDate, totalAmount: stipend.amount })
      .returning({ id: tables.expenses.id })

    await db.insert(tables.cashTransactions).values({
      direction: 'out',
      amount: stipend.amount,
      transactionDate: referenceDate,
      expenseId: expense.id,
      description: stipend.title
    })

    if (stipend.unitId) {
      await offsetStipendAgainstUnitDebt(db, stipend.unitId, stipend.amount, referenceDate, expense.id)
    }

    processed++
  }

  return processed
}

// Alıcı aynı zamanda bir dairenin sahibiyse, huzur hakkı o dairenin açık
// borcundan düşülür. 
async function offsetStipendAgainstUnitDebt(
  db: Database,
  unitId: number,
  amount: number,
  paidAt: string,
  expenseId: number
): Promise<void> {
  const openDebts = await getOpenDebtsForUnit(db, unitId)

  const forAllocation: OpenDebtForAllocation[] = openDebts
    .map((d) => ({ debtId: d.id, remainingPrincipal: d.amount - d.allocated, penaltyStartDate: d.penaltyStartDate }))
    .filter((d) => d.remainingPrincipal > 0)

  if (forAllocation.length === 0) return

  const rateSegments = await getRateSegments(db)
  const { allocations } = allocatePayment({ amount, paidAt, openDebts: forAllocation, rateSegments })
  if (allocations.length === 0) return

  const [payment] = await db
    .insert(tables.payments)
    .values({
      unitId,
      receiptNo: `HH-${expenseId}`,
      paidAt,
      amount,
      account: 'Huzur Hakkı Mahsubu',
      note: 'Huzur hakkının kendi aidat borcundan otomatik mahsubu, nakit girişi yok.'
    })
    .returning({ id: tables.payments.id })

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
  }
}
