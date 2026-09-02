export default defineEventHandler(async (event) => {
  await requireAdminWriteAccess(event)
  const id = Number(getRouterParam(event, 'id'))

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Geçersiz blok id.' })
  }

  try {
    await useDrizzle().delete(tables.blocks).where(eq(tables.blocks.id, id))
    return { success: true }
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'Bu bloğa bağlı daireler var, önce onları kaldırın veya pasife alın.' })
  }
})
