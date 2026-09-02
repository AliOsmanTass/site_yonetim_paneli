// Aylık kasa raporu — bölümlere ayrılmış nakit akışı: Devir → Gelirler →
// Giderler → Demirbaş Fonu → Sonuç.

import { and, eq, lt, sql, tables, type Database } from './drizzle'
import { roundCurrency } from './penalty'

export interface R5Line {
  label: string
  amount: number
}

export interface R5Data {
  month: string
  devir: number
  gelirler: R5Line[]
  giderler: R5Line[]
  demirbasFonu: R5Line[]
  sonuc: number
}

export async function getR5Data(db: Database, month: string): Promise<R5Data> {
  const monthStart = `${month}-01`

  const [{ priorIn }] = await db
    .select({ priorIn: sql<number>`COALESCE(SUM(CASE WHEN ${tables.cashTransactions.direction} = 'in' THEN ${tables.cashTransactions.amount} ELSE 0 END), 0)` })
    .from(tables.cashTransactions)
    .where(lt(tables.cashTransactions.transactionDate, monthStart))
  const [{ priorOut }] = await db
    .select({ priorOut: sql<number>`COALESCE(SUM(CASE WHEN ${tables.cashTransactions.direction} = 'out' THEN ${tables.cashTransactions.amount} ELSE 0 END), 0)` })
    .from(tables.cashTransactions)
    .where(lt(tables.cashTransactions.transactionDate, monthStart))
  const devir = roundCurrency(priorIn - priorOut)

  const [{ inSum, inCount }] = await db
    .select({
      inSum: sql<number>`COALESCE(SUM(${tables.cashTransactions.amount}), 0)`,
      inCount: sql<number>`COUNT(*)`
    })
    .from(tables.cashTransactions)
    .where(and(eq(tables.cashTransactions.direction, 'in'), sql`substr(${tables.cashTransactions.transactionDate}, 1, 7) = ${month}`))

  const gelirler: R5Line[] = inCount > 0 ? [{ label: `Aidat ve borç tahsilatları (${inCount} işlem)`, amount: roundCurrency(inSum) }] : []

  const outRows = await db
    .select({
      amount: tables.cashTransactions.amount,
      expenseType: tables.expenses.type,
      expenseTitle: tables.expenses.title
    })
    .from(tables.cashTransactions)
    .innerJoin(tables.expenses, eq(tables.cashTransactions.expenseId, tables.expenses.id))
    .where(and(eq(tables.cashTransactions.direction, 'out'), sql`substr(${tables.cashTransactions.transactionDate}, 1, 7) = ${month}`))

  const giderler: R5Line[] = []
  const demirbasFonu: R5Line[] = []
  for (const row of outRows) {
    if (row.expenseType === 'fixture') {
      demirbasFonu.push({ label: `Demirbaş — ${row.expenseTitle} — tedarikçi ödemesi`, amount: roundCurrency(row.amount) })
    } else {
      const prefix = row.expenseType === 'stipend' ? 'Huzur Hakkı' : 'Standart'
      giderler.push({ label: `${prefix} — ${row.expenseTitle}`, amount: roundCurrency(row.amount) })
    }
  }

  const gelirlerToplam = gelirler.reduce((s, l) => s + l.amount, 0)
  const giderlerToplam = giderler.reduce((s, l) => s + l.amount, 0)
  const demirbasToplam = demirbasFonu.reduce((s, l) => s + l.amount, 0)
  const sonuc = roundCurrency(devir + gelirlerToplam - giderlerToplam - demirbasToplam)

  return { month, devir, gelirler, giderler, demirbasFonu, sonuc }
}
