// Yeni borç ekleme — kalem kalem girilir (ürün/hizmet, adet, birim fiyat),

import { addDays, addMonths } from '../../utils/dates'
import { notifyNewDebt } from '../../utils/notifications'
import { roundCurrency } from '../../utils/penalty'
import { splitEqually } from '../../utils/split'

interface DebtItemPayload {
  description: string
  quantity: number
  unitPrice: number
}

interface CreateDebtPayload {
  debtTypeId: number
  unitId?: number
  targetAllUnits?: boolean
  title: string
  items: DebtItemPayload[]
  installmentTotal?: number
  penaltyApplicable: boolean
  dueDate: string
}

export default defineEventHandler(async (event) => {
  await requireAdminWriteAccess(event)
  const body = await readBody<CreateDebtPayload>(event)

  if (!body.debtTypeId || !body.title?.trim() || !body.dueDate) {
    throw createError({ statusCode: 400, statusMessage: 'Tür, başlık ve son ödeme tarihi gerekli.' })
  }
  if (!body.items?.length || body.items.some((i) => !i.description?.trim() || !i.quantity || i.quantity <= 0 || i.unitPrice < 0)) {
    throw createError({ statusCode: 400, statusMessage: 'En az bir kalem gerekli — adet ve birim fiyat geçerli olmalı.' })
  }
  if (!body.unitId && !body.targetAllUnits) {
    throw createError({ statusCode: 400, statusMessage: 'Hedef daire seçilmedi.' })
  }

  const db = useDrizzle()

  if (body.unitId) {
    const [targetUnit] = await db.select({ isClosed: tables.units.isClosed }).from(tables.units).where(eq(tables.units.id, body.unitId))
    if (targetUnit?.isClosed) {
      throw createError({ statusCode: 409, statusMessage: 'Bu sanal dairenin hesabı kapatılmış, yeni borç eklenemez.' })
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const title = body.title.trim()

  // lineTotal client'tan güvenilmez, sunucuda yeniden hesaplanır.
  const items = body.items.map((i) => ({
    description: i.description.trim(),
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    lineTotal: roundCurrency(i.quantity * i.unitPrice)
  }))
  const totalAmount = roundCurrency(items.reduce((sum, i) => sum + i.lineTotal, 0))

  const createdDebtIds: number[] = []

  if (body.targetAllUnits) {
    // Blok+no sırasına göre çekiyoruz, aksi halde "son daire" (kuruş
    // farkının gittiği yer) her seferinde değişebilir.
    const units = await db
      .select({ id: tables.units.id })
      .from(tables.units)
      .innerJoin(tables.blocks, eq(tables.units.blockId, tables.blocks.id))
      .where(eq(tables.units.isVirtual, false))
      .orderBy(tables.blocks.name, tables.units.number)
    if (!units.length) {
      throw createError({ statusCode: 400, statusMessage: 'Bölünecek gerçek daire yok.' })
    }

    // Her kalem kendi içinde daire sayısına bölünüyor, böylece toplamlar
    // orijinal kalem tutarına kuruşu kuruşuna eşit kalıyor.
    const perItemShares = items.map((item) => splitEqually(item.lineTotal, units.length))
    const notifyPromises: Promise<void>[] = []

    for (let u = 0; u < units.length; u++) {
      const documentNo = await nextDocumentNo(db)
      const unitItems = items.map((item, idx) => ({
        description: item.description,
        quantity: 1,
        unitPrice: perItemShares[idx]![u]!,
        lineTotal: perItemShares[idx]![u]!
      }))
      const unitAmount = roundCurrency(unitItems.reduce((sum, i) => sum + i.lineTotal, 0))

      const [debt] = await db
        .insert(tables.debts)
        .values({
          unitId: units[u]!.id,
          debtTypeId: body.debtTypeId,
          title,
          period: null,
          documentNo,
          documentDate: today,
          dueDate: body.dueDate,
          penaltyStartDate: body.penaltyApplicable ? addDays(body.dueDate, 1) : null,
          amount: unitAmount,
          installmentNo: null,
          installmentTotal: null,
          status: 'open'
        })
        .returning({ id: tables.debts.id })

      await db.insert(tables.debtItems).values(unitItems.map((i) => ({ ...i, debtId: debt.id })))
      createdDebtIds.push(debt.id)
      notifyPromises.push(notifyNewDebt(db, units[u]!.id, title, unitAmount, body.dueDate))
    }

    // E-posta gönderimleri borç kayıtlarını bekletmesin diye toplu ve paralel yapılıyor.
    await Promise.allSettled(notifyPromises)

    return { createdDebtIds }
  }

  // Tek daire, taksit isteğe bağlı. Kalemleri taksitlere bölmüyoruz, sadece
  // ilk taksite referans olsun diye yazıyoruz.
  const installmentTotal = body.installmentTotal && body.installmentTotal > 1 ? body.installmentTotal : 1
  const installmentAmounts = installmentTotal > 1 ? splitEqually(totalAmount, installmentTotal) : [totalAmount]

  for (let i = 0; i < installmentTotal; i++) {
    const dueDate = addMonths(body.dueDate, i)
    const documentNo = await nextDocumentNo(db)

    const [debt] = await db
      .insert(tables.debts)
      .values({
        unitId: body.unitId,
        debtTypeId: body.debtTypeId,
        title: installmentTotal > 1 ? `${title} ${i + 1}. Taksit` : title,
        period: null,
        documentNo,
        documentDate: today,
        dueDate,
        penaltyStartDate: body.penaltyApplicable ? addDays(dueDate, 1) : null,
        amount: installmentAmounts[i],
        installmentNo: installmentTotal > 1 ? i + 1 : null,
        installmentTotal: installmentTotal > 1 ? installmentTotal : null,
        status: 'open'
      })
      .returning({ id: tables.debts.id })

    if (i === 0) {
      await db.insert(tables.debtItems).values(items.map((item) => ({ ...item, debtId: debt.id })))
    }
    createdDebtIds.push(debt.id)
  }

  // Taksit sayısı ne olursa olsun tek bir özet bildirimi — taksit başına e-posta spam olur.
  await notifyNewDebt(db, body.unitId!, title, totalAmount, body.dueDate)

  return { createdDebtIds }
})