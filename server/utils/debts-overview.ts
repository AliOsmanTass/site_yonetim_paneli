// Borç listesi — tüm gerçek dairelerin açık borcu + o anki tazminatı.

import { alias } from 'drizzle-orm/sqlite-core'
import { and, eq, sql, tables, type Database } from './drizzle'
import { calculatePenalty, roundCurrency } from './penalty'
import { getRateSegments } from './rate-segments'

export interface UnitDebtOverview {
  unitId: number
  blockName: string
  number: string
  ownerName: string | null
  openDebt: number
  penalty: number
  total: number
  oldestDueDate: string | null
}

// Her gerçek dairenin açık borcunu, güncel tazminatını ve en eski vadesini döner.
export async function getDebtsOverview(db: Database): Promise<UnitDebtOverview[]> {
  const malikContacts = alias(tables.unitContacts, 'malikContacts')

  const units: { id: number; blockName: string; number: string; malikFirstName: string | null; malikLastName: string | null }[] = await db
    .select({
      id: tables.units.id,
      blockName: tables.blocks.name,
      number: tables.units.number,
      malikFirstName: malikContacts.firstName,
      malikLastName: malikContacts.lastName
    })
    .from(tables.units)
    .innerJoin(tables.blocks, eq(tables.units.blockId, tables.blocks.id))
    .leftJoin(malikContacts, and(eq(malikContacts.unitId, tables.units.id), eq(malikContacts.role, 'malik')))
    .where(eq(tables.units.isVirtual, false))
    .orderBy(tables.blocks.name, tables.units.number)

  const openDebtRows: { unitId: number; dueDate: string; penaltyStartDate: string | null; amount: number; allocated: number }[] = await db
    .select({
      unitId: tables.debts.unitId,
      dueDate: tables.debts.dueDate,
      penaltyStartDate: tables.debts.penaltyStartDate,
      amount: tables.debts.amount,
      allocated: sql<number>`COALESCE(SUM(${tables.paymentAllocations.principalAmount}), 0)`
    })
    .from(tables.debts)
    .leftJoin(tables.paymentAllocations, eq(tables.paymentAllocations.debtId, tables.debts.id))
    .where(sql`${tables.debts.status} != 'paid'`)
    .groupBy(tables.debts.id)

  const rateSegments = await getRateSegments(db)
  const today = new Date().toISOString().slice(0, 10)

  const byUnit = new Map<number, { remaining: number; dueDate: string; penaltyStartDate: string | null }[]>()
  for (const row of openDebtRows) {
    const remaining = roundCurrency(row.amount - row.allocated)
    if (remaining <= 0) continue
    const list = byUnit.get(row.unitId) ?? []
    list.push({ remaining, dueDate: row.dueDate, penaltyStartDate: row.penaltyStartDate })
    byUnit.set(row.unitId, list)
  }

  return units.map((unit) => {
    const debts = byUnit.get(unit.id) ?? []
    const openDebt = roundCurrency(debts.reduce((sum, d) => sum + d.remaining, 0))
    const penalty = roundCurrency(
      debts.reduce((sum, d) => sum + calculatePenalty({ principal: d.remaining, penaltyStartDate: d.penaltyStartDate, asOfDate: today, rateSegments }).amount, 0)
    )
    let oldestDueDate: string | null = null
    for (const d of debts) {
      if (oldestDueDate === null || d.dueDate < oldestDueDate) oldestDueDate = d.dueDate
    }

    return {
      unitId: unit.id,
      blockName: unit.blockName,
      number: unit.number,
      ownerName: unit.malikFirstName && unit.malikLastName ? `${unit.malikFirstName} ${unit.malikLastName}` : null,
      openDebt,
      penalty,
      total: roundCurrency(openDebt + penalty),
      oldestDueDate
    }
  })
}
