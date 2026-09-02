// Aylık borç detay raporu — seçilen ayda tüm dairelerin borç/ödeme/kalan
// durumu. Borç = o ay tahakkuk eden toplam
import { sql, tables, type Database } from './drizzle'
import { roundCurrency } from './penalty'
import { getDebtsOverview } from './debts-overview'

export interface R2Row {
  blockName: string
  number: string
  ownerName: string | null
  monthDebt: number
  monthPayment: number
  remaining: number
}

export async function getR2Rows(db: Database, month: string): Promise<R2Row[]> {
  const overview = await getDebtsOverview(db)

  const debtRows = await db
    .select({ unitId: tables.debts.unitId, amount: tables.debts.amount })
    .from(tables.debts)
    .where(sql`substr(${tables.debts.documentDate}, 1, 7) = ${month}`)
  const paymentRows = await db
    .select({ unitId: tables.payments.unitId, amount: tables.payments.amount })
    .from(tables.payments)
    .where(sql`substr(${tables.payments.paidAt}, 1, 7) = ${month}`)

  const debtByUnit = new Map<number, number>()
  for (const row of debtRows) debtByUnit.set(row.unitId, roundCurrency((debtByUnit.get(row.unitId) ?? 0) + row.amount))
  const paymentByUnit = new Map<number, number>()
  for (const row of paymentRows) paymentByUnit.set(row.unitId, roundCurrency((paymentByUnit.get(row.unitId) ?? 0) + row.amount))

  return overview.map((u) => ({
    blockName: u.blockName,
    number: u.number,
    ownerName: u.ownerName,
    monthDebt: debtByUnit.get(u.unitId) ?? 0,
    monthPayment: paymentByUnit.get(u.unitId) ?? 0,
    remaining: u.openDebt
  }))
}
