// Tazminat listesi — gecikme günü sıfırdan büyük olan, yani gerçekten
// tazminat işlemiş açık borçları listeler. 
import { isNotNull } from 'drizzle-orm'
import { and, eq, sql, tables, type Database } from './drizzle'
import { calculatePenalty, roundCurrency } from './penalty'
import { getRateSegments } from './rate-segments'

export interface R3Row {
  documentDate: string
  penaltyStartDate: string
  unitLabel: string
  title: string
  principal: number
  days: number
  penalty: number
}

export async function getR3Rows(db: Database): Promise<R3Row[]> {
  const debtRows = await db
    .select({
      documentDate: tables.debts.documentDate,
      penaltyStartDate: tables.debts.penaltyStartDate,
      title: tables.debts.title,
      amount: tables.debts.amount,
      blockName: tables.blocks.name,
      number: tables.units.number,
      allocated: sql<number>`COALESCE(SUM(${tables.paymentAllocations.principalAmount}), 0)`
    })
    .from(tables.debts)
    .innerJoin(tables.units, eq(tables.debts.unitId, tables.units.id))
    .innerJoin(tables.blocks, eq(tables.units.blockId, tables.blocks.id))
    .leftJoin(tables.paymentAllocations, eq(tables.paymentAllocations.debtId, tables.debts.id))
    .where(and(sql`${tables.debts.status} != 'paid'`, isNotNull(tables.debts.penaltyStartDate), eq(tables.units.isVirtual, false)))
    .groupBy(tables.debts.id)

  const rateSegments = await getRateSegments(db)
  const today = new Date().toISOString().slice(0, 10)

  const rows: R3Row[] = []
  for (const row of debtRows) {
    const remaining = roundCurrency(row.amount - row.allocated)
    if (remaining <= 0 || !row.penaltyStartDate) continue
    const { amount: penalty, days } = calculatePenalty({ principal: remaining, penaltyStartDate: row.penaltyStartDate, asOfDate: today, rateSegments })
    if (days <= 0) continue
    rows.push({
      documentDate: row.documentDate,
      penaltyStartDate: row.penaltyStartDate,
      unitLabel: `${row.blockName}-${row.number} · ${row.title}`,
      title: row.title,
      principal: remaining,
      days,
      penalty
    })
  }

  return rows
}
