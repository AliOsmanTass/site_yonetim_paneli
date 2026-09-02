// Site ayarlarını döner; hiç oluşturulmadıysa null — ekran bunu ilk kurulum
// formu olarak gösterir.
export default defineEventHandler(async (event) => {
  await requireAdminSession(event)

  const [settings] = await useDrizzle().select().from(tables.siteSettings).where(eq(tables.siteSettings.id, 1))
  return settings ?? null
})
