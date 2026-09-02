export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  return listDebtTypes(useDrizzle())
})
