// Demirbaş harcamasından otomatik oluşan duyurular da düzenlenebilir,
// expenseId hiç değişmez.
import { notifyAnnouncement } from '../../../utils/notifications'

interface AnnouncementPayload {
  title: string
  body: string
  publishedAt: string
  expiresAt?: string | null
  status: 'draft' | 'active' | 'passive' | 'archived'
}

export default defineEventHandler(async (event) => {
  await requireAdminWriteAccess(event)
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody<AnnouncementPayload>(event)

  if (!id || !body.title?.trim() || !body.body?.trim() || !body.publishedAt || !body.status) {
    throw createError({ statusCode: 400, statusMessage: 'Başlık, içerik, yayın tarihi ve durum gerekli.' })
  }

  const db = useDrizzle()
  const [existing] = await db.select({ status: tables.announcements.status }).from(tables.announcements).where(eq(tables.announcements.id, id))
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Duyuru bulunamadı.' })
  }

  const [updated] = await db
    .update(tables.announcements)
    .set({
      title: body.title.trim(),
      body: body.body.trim(),
      publishedAt: body.publishedAt,
      expiresAt: body.expiresAt || null,
      status: body.status
    })
    .where(eq(tables.announcements.id, id))
    .returning()

  // Sadece taslak/pasif → aktif geçişinde mail gider — zaten aktifken yapılan
  // bir düzenlemede (örn. yazım hatası düzeltme) tekrar mail atılmaz.
  if (existing.status !== 'active' && updated.status === 'active') {
    await notifyAnnouncement(db, updated.title, updated.body, updated.publishedAt)
  }

  return updated
})
