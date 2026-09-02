// Tüm duyurular (durumu ne olursa olsun), en yeni yayın tarihi üstte.
export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  return useDrizzle().select().from(tables.announcements).orderBy(desc(tables.announcements.publishedAt))
})
