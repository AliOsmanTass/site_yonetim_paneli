export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  return getDashboardSummary(useDrizzle())
})
