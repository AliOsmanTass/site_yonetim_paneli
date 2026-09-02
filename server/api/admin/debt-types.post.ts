// Yönetici yeni bir borç türü tanımlayabilir; hazır (sistem) türler
// silinemez ya da yeniden oluşturulamaz.
export default defineEventHandler(async (event) => {
  await requireAdminWriteAccess(event)
  const body = await readBody<{ name: string }>(event)

  if (!body.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Tür adı gerekli.' })
  }

  return createCustomDebtType(useDrizzle(), body.name.trim())
})
