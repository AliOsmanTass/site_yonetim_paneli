// Bir borca ödeme yapıldıktan sonra artık düzenlenemez — düzenleme, geçmişe
// dönük hesaplanmış tazminat ve mahsup kayıtlarını bozar.
import { addDays } from '../../../utils/dates'
import { roundCurrency } from '../../../utils/penalty'

interface DebtItemPayload {
  description: string
  quantity: number
  unitPrice: number
}

interface UpdateDebtPayload {
  debtTypeId: number
  title: string
  items: DebtItemPayload[]
  penaltyApplicable: boolean
  dueDate: string
}

export default defineEventHandler(async (event) => {
  await requireAdminWriteAccess(event)
  const debtId = Number(getRouterParam(event, 'debtId'))
  const body = await readBody<UpdateDebtPayload>(event)

  if (!debtId || !body.debtTypeId || !body.title?.trim() || !body.dueDate) {
    throw createError({ statusCode: 400, statusMessage: 'Tür, başlık ve son ödeme tarihi gerekli.' })
  }
  if (!body.items?.length || body.items.some((i) => !i.description?.trim() || !i.quantity || i.quantity <= 0 || i.unitPrice < 0)) {
    throw createError({ statusCode: 400, statusMessage: 'En az bir kalem gerekli — adet ve birim fiyat geçerli olmalı.' })
  }

  const db = useDrizzle()

  const [allocationRef] = await db
    .select({ id: tables.paymentAllocations.id })
    .from(tables.paymentAllocations)
    .where(eq(tables.paymentAllocations.debtId, debtId))
    .limit(1)
  if (allocationRef) {
    throw createError({ statusCode: 409, statusMessage: 'Bu borca ödeme yapılmış, düzenlenemez.' })
  }

  const items = body.items.map((i) => ({
    description: i.description.trim(),
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    lineTotal: roundCurrency(i.quantity * i.unitPrice)
  }))
  const amount = roundCurrency(items.reduce((sum, i) => sum + i.lineTotal, 0))

  const [updated] = await db
    .update(tables.debts)
    .set({
      debtTypeId: body.debtTypeId,
      title: body.title.trim(),
      amount,
      dueDate: body.dueDate,
      penaltyStartDate: body.penaltyApplicable ? addDays(body.dueDate, 1) : null
    })
    .where(eq(tables.debts.id, debtId))
    .returning()

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Borç bulunamadı.' })
  }

  await db.delete(tables.debtItems).where(eq(tables.debtItems.debtId, debtId))
  await db.insert(tables.debtItems).values(items.map((i) => ({ ...i, debtId })))

  return { ...updated, items }
})
