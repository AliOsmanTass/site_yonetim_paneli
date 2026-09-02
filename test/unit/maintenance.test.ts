import { describe, expect, it } from 'vitest'
import { tables } from '../../server/utils/drizzle'
import { runDailyMaintenance } from '../../server/utils/maintenance'
import { createTestDb } from '../helpers/test-db'

describe('runDailyMaintenance', () => {
  // Bir duyurunun askı süresi dolduysa, günlük bakım görevi onu
  // otomatik olarak arşive taşımalı.
  it('askı süresi dolmuş aktif duyuruyu arşive taşır', async () => {
    const db = createTestDb()
    await db.insert(tables.announcements).values({
      title: 'Hidrofor Yenileme',
      body: '...',
      status: 'active',
      publishedAt: '2026-06-01',
      expiresAt: '2026-06-30'
    })

    const result = await runDailyMaintenance(db, '2026-07-01')
    expect(result.archived).toBe(1)

    const [announcement] = await db.select().from(tables.announcements)
    expect(announcement.status).toBe('archived')
  })

  // Askı süresi henüz dolmamış bir duyuru, vaktinden önce arşive alınmamalı.
  it('süresi dolmamış aktif duyuruya dokunmaz', async () => {
    const db = createTestDb()
    await db.insert(tables.announcements).values({
      title: 'Devam eden duyuru',
      body: '...',
      status: 'active',
      publishedAt: '2026-06-01',
      expiresAt: '2026-08-01'
    })

    const result = await runDailyMaintenance(db, '2026-07-01')
    expect(result.archived).toBe(0)
  })

  // Bir duyurunun hiç bitiş tarihi tanımlanmamışsa, o duyuru süresiz kabul
  // edilip asla otomatik arşive alınmamalı.
  it('askı süresi olmayan (expiresAt null) aktif duyuruya dokunmaz', async () => {
    const db = createTestDb()
    await db.insert(tables.announcements).values({
      title: 'Süresiz duyuru',
      body: '...',
      status: 'active',
      publishedAt: '2026-06-01'
    })

    const result = await runDailyMaintenance(db, '2026-07-01')
    expect(result.archived).toBe(0)
  })

  // Görev sadece aktif durumdaki duyuruları hedeflemeli; henüz yayınlanmamış
  // (taslak), yayından kaldırılmış (pasif) ya da zaten arşivdeki duyurulara
  // dokunmamalı.
  it('taslak/pasif/zaten arşiv durumundaki duyurulara dokunmaz', async () => {
    const db = createTestDb()
    await db.insert(tables.announcements).values([
      { title: 'Taslak', body: '...', status: 'draft', publishedAt: '2026-06-01', expiresAt: '2026-06-30' },
      { title: 'Arşiv', body: '...', status: 'archived', publishedAt: '2026-05-01', expiresAt: '2026-05-30' }
    ])

    const result = await runDailyMaintenance(db, '2026-07-01')
    expect(result.archived).toBe(0)
  })
})
