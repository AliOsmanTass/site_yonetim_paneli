// Borç sorgusu formundaki blok listesi.
export default defineEventHandler(async () => {
  return useDrizzle()
    .select({ id: tables.blocks.id, name: tables.blocks.name })
    .from(tables.blocks)
    .orderBy(tables.blocks.name)
})
