export default defineEventHandler(async (event) => {
  await requireAdminWriteAccess(event)
  const body = await readBody<{ name: string }>(event)

  if (!body.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Blok adı gerekli.' })
  }

  try {
    const [block] = await useDrizzle().insert(tables.blocks).values({ name: body.name.trim() }).returning()
    return block
  } catch {
    throw createError({ statusCode: 409, statusMessage: `"${body.name.trim()}" adında bir blok zaten var.` })
  }
})
