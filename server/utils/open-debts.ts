// Bir dairenin açık borçlarını, her birine o ana kadar mahsup edilmiş
// anaparayla birlikte döner.
import { and, eq, sql, tables, type Database } from './drizzle'

export interface OpenDebtRow {
  id: number
  title: string
  amount: number
  dueDate: string
  penaltyStartDate: string | null
  allocated: number
}

export async function getOpenDebtsForUnit(db: Database, unitId: number): Promise<OpenDebtRow[]> {
  return db
    .select({
      id: tables.debts.id,
      title: tables.debts.title,
      amount: tables.debts.amount,
      dueDate: tables.debts.dueDate,
      penaltyStartDate: tables.debts.penaltyStartDate,
      allocated: sql<number>`
        COALESCE
          (SUM(${tables.paymentAllocations.principalAmount}), 0)`
    })
    .from(tables.debts)
    .leftJoin(tables.paymentAllocations, eq(tables.paymentAllocations.debtId, tables.debts.id))
    .where(and(eq(tables.debts.unitId, unitId), sql`${tables.debts.status} != 'paid'`))
    .groupBy(tables.debts.id)
    .orderBy(tables.debts.dueDate)
}
