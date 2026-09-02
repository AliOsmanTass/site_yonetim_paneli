import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { tables } from '../../server/utils/drizzle'
import { createFixtureExpense, createStandardExpense } from '../../server/utils/expenses'
import { createTestDb } from '../helpers/test-db'

describe('createStandardExpense', () => {
  // Standart bir harcama sadece kasadan para çıkışıdır;
  // hiçbir daireye borç yazmamalı, otomatik duyuru da açmamalı.
  it('yalnızca kasa hareketi yazar — borç ve duyuru oluşturmaz', async () => {
    const db = createTestDb()
    const result = await createStandardExpense(db, {
      title: 'Bahçe Bakımı',
      expenseDate: '2026-07-01',
      items: [{ description: 'Bahçıvan', quantity: 1, unitPrice: 4870 }]
    })

    expect(result.totalAmount).toBe(4870)
    const transactions = await db.select().from(tables.cashTransactions)
    expect(transactions).toHaveLength(1)
    expect(transactions[0]).toMatchObject({ direction: 'out', amount: 4870 })

    const debts = await db.select().from(tables.debts)
    expect(debts).toHaveLength(0)
    const announcements = await db.select().from(tables.announcements)
    expect(announcements).toHaveLength(0)
  })
})

describe('createFixtureExpense', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(async () => {
    db = createTestDb()
    const [block] = await db.insert(tables.blocks).values({ name: 'A' }).returning({ id: tables.blocks.id })
    for (let i = 0; i < 5; i++) {
      await db.insert(tables.units).values({ blockId: block.id, number: String(i + 1) })
    }
    // Sanal daire — bölüşüme dahil edilmemeli.
    await db.insert(tables.units).values({ blockId: block.id, number: '1-D1', isVirtual: true })
  })

  // Demirbaş harcaması tüm gerçek dairelere paylaştırılıyor; bölme sonucu tam
  // kuruşa denk gelmese bile toplam orijinal tutarla birebir eşleşmeli, ve
  // sanal daireler bu paylaşıma hiç dahil edilmemeli.
  it('gerçek dairelere kuruşu kuruşuna eşit borç yazar, sanal daireyi hariç tutar', async () => {
    const result = await createFixtureExpense(db, {
      title: 'Hidrofor Yenileme',
      expenseDate: '2026-07-15',
      dueDate: '2026-07-30',
      penaltyApplicable: true,
      items: [{ description: 'Hidrofor Motoru', quantity: 1, unitPrice: 1000.03 }]
    })

    expect(result.unitCount).toBe(5)

    const debts = await db.select().from(tables.debts).where(eq(tables.debts.expenseId, result.id))
    expect(debts).toHaveLength(5)
    const sum = Math.round(debts.reduce((s, d) => s + d.amount, 0) * 100) / 100
    expect(sum).toBe(1000.03)
    expect(debts.every((d) => d.status === 'open' && d.installmentNo === null)).toBe(true)
  })

  // Sakinler demirbaş harcamasından haberdar olsun diye otomatik ve doğrudan
  // aktif bir duyuru açılmalı, harcama kaydı da bu duyuruya bağlanmalı.
  it('demirbaş harcaması otomatik aktif duyuru oluşturur ', async () => {
    const result = await createFixtureExpense(db, {
      title: 'Asansör Motoru',
      expenseDate: '2026-07-15',
      dueDate: '2026-07-30',
      penaltyApplicable: false,
      items: [{ description: 'Motor', quantity: 1, unitPrice: 5000 }]
    })

    const announcements = await db.select().from(tables.announcements)
    expect(announcements).toHaveLength(1)
    expect(announcements[0].status).toBe('active')

    const [expense] = await db.select().from(tables.expenses).where(eq(tables.expenses.id, result.id))
    expect(expense.announcementId).toBe(announcements[0].id)
  })

  // Demirbaş harcaması girilirken tazminat işletme kapatılmışsa, oluşan
  // borçlarda tazminat başlangıç tarihi hiç yazılmamalı.
  it('gecikme tazminatı kapalıysa penaltyStartDate null kalır', async () => {
    const result = await createFixtureExpense(db, {
      title: 'Bahçe Ekipmanı',
      expenseDate: '2026-07-15',
      dueDate: '2026-07-30',
      penaltyApplicable: false,
      items: [{ description: 'Çim Biçme Makinesi', quantity: 1, unitPrice: 2000 }]
    })

    const debts = await db.select().from(tables.debts).where(eq(tables.debts.expenseId, result.id))
    expect(debts.every((d) => d.penaltyStartDate === null)).toBe(true)
  })
})
