// Yeni harcama — Standart (sadece kasadan düşer) ya da Demirbaş (her
// gerçek daireye borç yazar ve otomatik bir duyuru oluşturur).
import { createFixtureExpense, createStandardExpense, type ExpenseItemInput } from '../../utils/expenses'

interface ExpensePayload {
  type: 'standard' | 'fixture'
  title: string
  expenseDate: string
  dueDate?: string
  penaltyApplicable?: boolean
  items: ExpenseItemInput[]
}

export default defineEventHandler(async (event) => {
  await requireAdminWriteAccess(event)
  const body = await readBody<ExpensePayload>(event)

  if (!body.title?.trim() || !body.expenseDate || !body.items?.length) {
    throw createError({ statusCode: 400, statusMessage: 'Başlık, tarih ve en az bir kalem gerekli.' })
  }
  if (body.items.some((i) => !i.description?.trim() || !i.quantity || i.quantity <= 0 || i.unitPrice < 0)) {
    throw createError({ statusCode: 400, statusMessage: 'Kalemlerde adet ve birim fiyat geçerli olmalı.' })
  }

  const db = useDrizzle()

  if (body.type === 'standard') {
    return createStandardExpense(db, { title: body.title, expenseDate: body.expenseDate, items: body.items })
  }

  if (body.type === 'fixture') {
    if (!body.dueDate) {
      throw createError({ statusCode: 400, statusMessage: 'Demirbaş harcamasında son ödeme tarihi gerekli.' })
    }
    return createFixtureExpense(db, {
      title: body.title,
      expenseDate: body.expenseDate,
      dueDate: body.dueDate,
      penaltyApplicable: body.penaltyApplicable ?? true,
      items: body.items
    })
  }

  throw createError({ statusCode: 400, statusMessage: 'Geçersiz harcama türü.' })
})
