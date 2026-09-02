// Harcama listesi, en yeni üstte.
export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  return useDrizzle().select().from(tables.expenses).orderBy(desc(tables.expenses.expenseDate))
})
