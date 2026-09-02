// Kasa/harcama işlemleri.
import { and, eq, gt, sql, tables, type Database } from './drizzle'
import { addDays } from './dates'
import { roundCurrency } from './penalty'
import { splitEqually } from './split'
import { ensureSystemDebtTypes } from './debt-types'
import { nextDocumentNo } from './document-no'
import { notifyAnnouncement } from './notifications'

export interface ExpenseItemInput {
  description: string
  quantity: number
  unitPrice: number
}

interface BaseExpenseInput {
  title: string
  expenseDate: string
  items: ExpenseItemInput[]
}

// Kalemlerin satır toplamlarını ve genel toplamı hesaplar.
function computeItems(items: ExpenseItemInput[]) {
  const computed = items.map((i) => ({
    description: i.description.trim(),
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    lineTotal: roundCurrency(i.quantity * i.unitPrice)
  }))
  const totalAmount = roundCurrency(computed.reduce((sum, i) => sum + i.lineTotal, 0))
  return { computed, totalAmount }
}

// Sadece kasadan düşen standart bir harcama kaydeder.
export async function createStandardExpense(db: Database, input: BaseExpenseInput) {
  const { computed, totalAmount } = computeItems(input.items)

  const [expense] = await db
    .insert(tables.expenses)
    .values({ type: 'standard', title: input.title.trim(), expenseDate: input.expenseDate, totalAmount })
    .returning({ id: tables.expenses.id })

  await db.insert(tables.expenseItems).values(computed.map((i) => ({ ...i, expenseId: expense.id })))

  await db.insert(tables.cashTransactions).values({
    direction: 'out',
    amount: totalAmount,
    transactionDate: input.expenseDate,
    expenseId: expense.id,
    description: input.title.trim()
  })

  return { id: expense.id, totalAmount }
}

export interface CreateFixtureExpenseInput extends BaseExpenseInput {
  dueDate: string
  penaltyApplicable: boolean
}

// Demirbaş harcamasını gerçek dairelere eşit borç olarak dağıtır, otomatik duyuru açar.
export async function createFixtureExpense(db: Database, input: CreateFixtureExpenseInput) {
  const { computed, totalAmount } = computeItems(input.items)

  // Bölme sonucundaki kuruş farkı son daireye yazılır
  const units = await db
    .select({ id: tables.units.id })
    .from(tables.units)
    .innerJoin(tables.blocks, eq(tables.units.blockId, tables.blocks.id))
    .where(eq(tables.units.isVirtual, false))
    .orderBy(tables.blocks.name, tables.units.number)
  if (!units.length) {
    throw new Error('Bölünecek gerçek daire yok.')
  }

  const shares = splitEqually(totalAmount, units.length)

  const representativeShare = shares[0]!

  const [expense] = await db
    .insert(tables.expenses)
    .values({ type: 'fixture', title: input.title.trim(), expenseDate: input.expenseDate, totalAmount, perUnitAmount: representativeShare })
    .returning({ id: tables.expenses.id })

  await db.insert(tables.expenseItems).values(computed.map((i) => ({ ...i, expenseId: expense.id })))

  await db.insert(tables.cashTransactions).values({
    direction: 'out',
    amount: totalAmount,
    transactionDate: input.expenseDate,
    expenseId: expense.id,
    description: input.title.trim()
  })

  await ensureSystemDebtTypes(db)
  const [demirbasType] = await db.select().from(tables.debtTypes).where(eq(tables.debtTypes.name, 'Demirbaş'))

  const penaltyStartDate = input.penaltyApplicable ? addDays(input.dueDate, 1) : null

  for (let i = 0; i < units.length; i++) {
    const documentNo = await nextDocumentNo(db)
    await db.insert(tables.debts).values({
      unitId: units[i].id,
      debtTypeId: demirbasType.id,
      title: input.title.trim(),
      period: null,
      documentNo,
      documentDate: input.expenseDate,
      dueDate: input.dueDate,
      penaltyStartDate,
      amount: shares[i],
      installmentNo: null,
      installmentTotal: null,
      expenseId: expense.id,
      status: 'open'
    })
  }

  const announcementTitle = `Demirbaş Harcaması: ${input.title.trim()}`
  const announcementBody = `${input.title.trim()} için toplam ${totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺ harcandı. Daire başı pay: ${representativeShare.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺.`

  const [announcement] = await db
    .insert(tables.announcements)
    .values({
      title: announcementTitle,
      body: announcementBody,
      status: 'active',
      publishedAt: input.expenseDate,
      expenseId: expense.id
    })
    .returning({ id: tables.announcements.id })

  await db.update(tables.expenses).set({ announcementId: announcement.id }).where(eq(tables.expenses.id, expense.id))

  // Bu duyuru doğrudan 'active' olarak açılıyor, elle girilen duyurularla
  // aynı mantıkla hemen mail gider (bkz. server/utils/notifications.ts).
  await notifyAnnouncement(db, announcementTitle, announcementBody, input.expenseDate)

  return { id: expense.id, totalAmount, unitCount: units.length, announcementId: announcement.id }
}

export async function deleteExpense(db: Database, expenseId: number): Promise<void> {
  const [expense] = await db.select().from(tables.expenses).where(eq(tables.expenses.id, expenseId))
  if (!expense) {
    throw createError({ statusCode: 404, statusMessage: 'Harcama bulunamadı.' })
  }

  if (expense.type === 'fixture') {
    const debts: { status: string }[] = await db.select({ status: tables.debts.status }).from(tables.debts).where(eq(tables.debts.expenseId, expenseId))
    if (debts.some((d) => d.status !== 'open')) {
      throw createError({ statusCode: 409, statusMessage: 'Bu harcamanın oluşturduğu borçlardan en az birine ödeme yapılmış, silinemez.' })
    }
    await db.delete(tables.debts).where(eq(tables.debts.expenseId, expenseId))
  }

  // Huzur hakkının kendi aidat borcuna otomatik mahsubu varsa (bkz.
  // offsetStipendAgainstUnitDebt), receiptNo'suyla bulunup geri alınır — ama
  // sadece o dairenin en son ödemesiyse, aradan başka ödeme geçtiyse silinemez.
  if (expense.type === 'stipend') {
    const [offsetPayment] = await db.select().from(tables.payments).where(eq(tables.payments.receiptNo, `HH-${expenseId}`))
    if (offsetPayment) {
      const [laterPayment] = await db
        .select({ id: tables.payments.id })
        .from(tables.payments)
        .where(and(eq(tables.payments.unitId, offsetPayment.unitId), gt(tables.payments.id, offsetPayment.id)))
        .limit(1)
      if (laterPayment) {
        throw createError({ statusCode: 409, statusMessage: 'Bu huzur hakkının mahsup edildiği dairede sonradan başka ödeme girilmiş, silinemez.' })
      }

      const allocations = await db.select().from(tables.paymentAllocations).where(eq(tables.paymentAllocations.paymentId, offsetPayment.id))
      await db.delete(tables.paymentAllocations).where(eq(tables.paymentAllocations.paymentId, offsetPayment.id))

      for (const allocation of allocations) {
        const [debt] = await db.select({ amount: tables.debts.amount }).from(tables.debts).where(eq(tables.debts.id, allocation.debtId))
        if (!debt) continue
        const [{ remaining }] = await db
          .select({ remaining: sql<number>`COALESCE(SUM(${tables.paymentAllocations.principalAmount}), 0)` })
          .from(tables.paymentAllocations)
          .where(eq(tables.paymentAllocations.debtId, allocation.debtId))
        const status = remaining <= 0 ? 'open' : remaining >= debt.amount ? 'paid' : 'partial'
        await db.update(tables.debts).set({ status }).where(eq(tables.debts.id, allocation.debtId))
      }

      await db.delete(tables.payments).where(eq(tables.payments.id, offsetPayment.id))
    }
  }

  // expenses ve announcements birbirini karşılıklı referans ediyor
  // (expenses.announcement_id ↔ announcements.expense_id) — ikisi de karşı
  // taraf hâlâ dururken silinemiyor, önce bu döngü kırılmalı.
  if (expense.announcementId) {
    await db.update(tables.expenses).set({ announcementId: null }).where(eq(tables.expenses.id, expenseId))
    await db.delete(tables.announcements).where(eq(tables.announcements.id, expense.announcementId))
  }

  await db.delete(tables.cashTransactions).where(eq(tables.cashTransactions.expenseId, expenseId))
  await db.delete(tables.expenseItems).where(eq(tables.expenseItems.expenseId, expenseId))
  await db.delete(tables.expenses).where(eq(tables.expenses.id, expenseId))
}
