// Elle duyuru ekleme 
import { notifyAnnouncement } from '../../utils/notifications'

interface AnnouncementPayload {
  title: string
  body: string
  publishedAt: string
  expiresAt?: string | null
  status: 'draft' | 'active' | 'passive' | 'archived'
}

export default defineEventHandler(async (event) => {
  await requireAdminWriteAccess(event)
  const body = await readBody<AnnouncementPayload>(event)

  if (!body.title?.trim() || !body.body?.trim() || !body.publishedAt || !body.status) {
    throw createError({ statusCode: 400, statusMessage: 'Başlık, içerik, yayın tarihi ve durum gerekli.' })
  }

  const db = useDrizzle()
  const [created] = await db
    .insert(tables.announcements)
    .values({
      title: body.title.trim(),
      body: body.body.trim(),
      publishedAt: body.publishedAt,
      expiresAt: body.expiresAt || null,
      status: body.status
    })
    .returning()

  // Doğrudan aktif olarak oluşturulan duyurular hemen mail atar
  if (created.status === 'active') {
    await notifyAnnouncement(db, created.title, created.body, created.publishedAt)
  }

  return created
})
