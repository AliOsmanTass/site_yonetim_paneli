export default defineEventHandler(async (event) => {
  await requireAdminSession(event)

  return useDrizzle().select().from(tables.blocks).orderBy(tables.blocks.name)
})
