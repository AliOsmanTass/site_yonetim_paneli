// Kasa/Harcama sayfasındaki özet kartlar. "Demirbaş Fonu" burada bu ayki
// toplam demirbaş harcaması olarak hesaplanıyor.
export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const db = useDrizzle()
  const month = new Date().toISOString().slice(0, 7)

  const [{ totalIn }] = await db
    .select({ totalIn: sql<number>`COALESCE(SUM(CASE WHEN ${tables.cashTransactions.direction} = 'in' THEN ${tables.cashTransactions.amount} ELSE 0 END), 0)` })
    .from(tables.cashTransactions)
  const [{ totalOut }] = await db
    .select({ totalOut: sql<number>`COALESCE(SUM(CASE WHEN ${tables.cashTransactions.direction} = 'out' THEN ${tables.cashTransactions.amount} ELSE 0 END), 0)` })
    .from(tables.cashTransactions)

  const [{ monthIn }] = await db
    .select({ monthIn: sql<number>`COALESCE(SUM(${tables.cashTransactions.amount}), 0)` })
    .from(tables.cashTransactions)
    .where(and(eq(tables.cashTransactions.direction, 'in'), sql`substr(${tables.cashTransactions.transactionDate}, 1, 7) = ${month}`))
  const [{ monthOut }] = await db
    .select({ monthOut: sql<number>`COALESCE(SUM(${tables.cashTransactions.amount}), 0)` })
    .from(tables.cashTransactions)
    .where(and(eq(tables.cashTransactions.direction, 'out'), sql`substr(${tables.cashTransactions.transactionDate}, 1, 7) = ${month}`))

  const [{ fixtureFund }] = await db
    .select({ fixtureFund: sql<number>`COALESCE(SUM(${tables.expenses.totalAmount}), 0)` })
    .from(tables.expenses)
    .where(and(eq(tables.expenses.type, 'fixture'), sql`substr(${tables.expenses.expenseDate}, 1, 7) = ${month}`))

  return {
    cashBalance: totalIn - totalOut,
    monthIncome: monthIn,
    monthExpense: monthOut,
    fixtureFund
  }
})
