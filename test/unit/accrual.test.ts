import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { tables } from '../../server/utils/drizzle'
import { runMonthlyAccrual } from '../../server/utils/accrual'
import { createTestDb } from '../helpers/test-db'

describe('runMonthlyAccrual', () => {
  let db: ReturnType<typeof createTestDb>
  let unitId: number

  beforeEach(async () => {
    db = createTestDb()
    const [block] = await db.insert(tables.blocks).values({ name: 'A' }).returning({ id: tables.blocks.id })
    const [unit] = await db
      .insert(tables.units)
      .values({ blockId: block.id, number: '31' })
      .returning({ id: tables.units.id })
    unitId = unit.id
    await db.insert(tables.debtTypes).values({ name: 'Aidat', isSystem: true })
    await db.insert(tables.siteSettings).values({
      id: 1,
      siteName: 'Test Sitesi',
      monthlyFee: 4700,
      dueDayStart: 1,
      dueDayEnd: 5,
      latePenaltyMonthlyRate: 0.05
    })
  })

  // Aylık tahakkuk çalıştığında bir daireye doğru tutarda,
  // doğru vade ve tazminat başlangıç tarihleriyle aidat borcu yazılıyor mu.
  it('daireye doküman örneğindeki tarihlerle aidat borcu yazar', async () => {
    await runMonthlyAccrual(db, '2026-07-01')

    const debts = await db.select().from(tables.debts).where(eq(tables.debts.unitId, unitId))
    expect(debts).toHaveLength(1)
    expect(debts[0]).toMatchObject({
      amount: 4700,
      period: '2026-07',
      dueDate: '2026-07-05',
      penaltyStartDate: '2026-07-06',
      status: 'open'
    })
  })

  // Cron görevi bir hata yüzünden ya da elle aynı ay için iki kez çalıştırılsa
  // bile, aynı aidat borcu iki kere yazılmamalı.
  it('idempotency: cron aynı ay iki kez tetiklenirse mükerrer borç oluşmaz', async () => {
    const first = await runMonthlyAccrual(db, '2026-07-01')
    const second = await runMonthlyAccrual(db, '2026-07-01')

    const debts = await db.select().from(tables.debts).where(eq(tables.debts.unitId, unitId))
    expect(debts).toHaveLength(1)
    expect(first.accrued).toBe(1)
    expect(second.accrued).toBe(0)
    expect(second.skipped).toBe(1)
  })

  // Bir daire henüz malik/kiracı bilgisi girilmemiş olsa bile, sistemdeki
  // gerçek bir daireyse aidattan muaf tutulmamalı.
  it('sistemdeki her daire (boş olsa bile) tahakkuk alır', async () => {
    const [block] = await db.insert(tables.blocks).values({ name: 'B' }).returning({ id: tables.blocks.id })
    const [emptyUnit] = await db.insert(tables.units).values({ blockId: block.id, number: '01' }).returning({ id: tables.units.id })

    await runMonthlyAccrual(db, '2026-07-01')

    const debts = await db.select().from(tables.debts).where(eq(tables.debts.unitId, emptyUnit.id))
    expect(debts).toHaveLength(1)
    expect(debts[0].amount).toBe(4700)
  })

  // Sanal daireler gerçek bir konut değil, malik değişince eski borcu taşımak
  // için açılan gölge kayıtlar; bunlara yeni aidat yazılmamalı.
  it('sanal daireler tahakkuk almaz — yalnızca eski borcu taşıyan gölge kayıt', async () => {
    const [block] = await db.insert(tables.blocks).values({ name: 'C' }).returning({ id: tables.blocks.id })
    const [virtualUnit] = await db
      .insert(tables.units)
      .values({ blockId: block.id, number: '01-D1', isVirtual: true })
      .returning({ id: tables.units.id })

    await runMonthlyAccrual(db, '2026-07-01')

    const debts = await db.select().from(tables.debts).where(eq(tables.debts.unitId, virtualUnit.id))
    expect(debts).toHaveLength(0)
  })

  // Yönetici aynı zamanda bir dairenin sahibiyse, kendisine ödenecek huzur hakkı
  // nakit olarak ödenmiyor; doğrudan kendi aidat borcundan düşülüyor. Bu yüzden
  // kasaya ekstra bir "para girişi" satırı yazılmamalı, sadece gider çıkışı olmalı.
  it('huzur hakkı: daire sahibi yöneticide aidat borcundan mahsup edilir, kasaya fazladan giriş yazılmaz', async () => {
    await db
      .update(tables.siteSettings)
      .set({ managerStipend: 2000, managerUnitId: unitId })
      .where(eq(tables.siteSettings.id, 1))

    await runMonthlyAccrual(db, '2026-07-01')

    const [debt] = await db.select().from(tables.debts).where(eq(tables.debts.unitId, unitId))
    expect(debt.status).toBe('partial')

    const allocations = await db.select().from(tables.paymentAllocations)
    expect(allocations).toHaveLength(1)
    expect(allocations[0].principalAmount).toBe(2000)

    const cashIn = await db.select().from(tables.cashTransactions).where(eq(tables.cashTransactions.direction, 'in'))
    expect(cashIn).toHaveLength(0)

    const cashOut = await db.select().from(tables.cashTransactions).where(eq(tables.cashTransactions.direction, 'out'))
    expect(cashOut).toHaveLength(1)
    expect(cashOut[0].amount).toBe(2000)
  })

  // Huzur hakkı alan kişi sitede daire sahibi değilse mahsup edilecek bir borcu
  // yoktur; bu durumda sadece kasadan normal bir gider çıkışı yazılmalı.
  it('huzur hakkı tanımlı ama alıcı daire sahibi değilse yalnızca kasa gideri oluşur', async () => {
    await db.update(tables.siteSettings).set({ assistantStipend: 1500 }).where(eq(tables.siteSettings.id, 1))

    await runMonthlyAccrual(db, '2026-07-01')

    const expenses = await db.select().from(tables.expenses).where(eq(tables.expenses.type, 'stipend'))
    expect(expenses).toHaveLength(1)

    const allocations = await db.select().from(tables.paymentAllocations)
    expect(allocations).toHaveLength(0)
  })
})
