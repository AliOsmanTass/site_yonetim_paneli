// Sadece aktif duyurular, en yeni yayın tarihi üstte.
export default defineEventHandler(async () => {
  return useDrizzle()
    .select({
      title: tables.announcements.title,
      body: tables.announcements.body,
      publishedAt: tables.announcements.publishedAt
    })
    .from(tables.announcements)
    .where(eq(tables.announcements.status, 'active'))
    .orderBy(desc(tables.announcements.publishedAt))
})
