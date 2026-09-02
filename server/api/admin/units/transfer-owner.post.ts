// Malik değiştirme. Dairenin açık borcu varsa eski borç yeni malikin
// üzerine geçmez — "sanal daire" adında görünmez bir kayıt açılıp eski
// borç oraya taşınır, böylece yasal takip bozulmadan devam eder.

interface ContactInput {
  firstName: string
  lastName: string
  phone?: string
  email?: string
}

interface TransferOwnerPayload {
  unitId: number
  newMalik: ContactInput
  newKiraci?: ContactInput
}

export default defineEventHandler(async (event) => {
  await requireAdminWriteAccess(event)
  const body = await readBody<TransferOwnerPayload>(event)

  if (!body.unitId || !body.newMalik?.firstName?.trim() || !body.newMalik?.lastName?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Daire ve yeni malik adı/soyadı gerekli.' })
  }

  const db = useDrizzle()
  const [unit] = await db.select().from(tables.units).where(eq(tables.units.id, body.unitId))
  if (!unit) {
    throw createError({ statusCode: 404, statusMessage: 'Daire bulunamadı.' })
  }
  if (unit.isVirtual) {
    throw createError({ statusCode: 400, statusMessage: 'Sanal dairenin maliki değiştirilemez.' })
  }

  const openDebts = await db
    .select({ id: tables.debts.id })
    .from(tables.debts)
    .where(and(eq(tables.debts.unitId, unit.id), sql`${tables.debts.status} != 'paid'`))

  let virtualUnitId: number | null = null
  let virtualUnitNumber: string | null = null

  if (openDebts.length > 0) {
    virtualUnitNumber = `${unit.number}-D${unit.id}`
    const [virtualUnit] = await db
      .insert(tables.units)
      .values({ blockId: unit.blockId, number: virtualUnitNumber, isVirtual: true })
      .returning()
    virtualUnitId = virtualUnit.id

    // Açık borçlar + eski malik/kiracı kayıtları sanal daireye taşınır (yasal takip için).
    await db
      .update(tables.debts)
      .set({ unitId: virtualUnit.id })
      .where(and(eq(tables.debts.unitId, unit.id), sql`${tables.debts.status} != 'paid'`))
    await db.update(tables.unitContacts).set({ unitId: virtualUnit.id }).where(eq(tables.unitContacts.unitId, unit.id))
  } else {
    // Taşınacak açık borç yok — eski malik/kiracı doğrudan silinir.
    await db.delete(tables.unitContacts).where(eq(tables.unitContacts.unitId, unit.id))
  }

  await db.insert(tables.unitContacts).values({
    unitId: unit.id,
    firstName: body.newMalik.firstName.trim(),
    lastName: body.newMalik.lastName.trim(),
    phone: body.newMalik.phone || null,
    email: body.newMalik.email || null,
    role: 'malik'
  })

  if (body.newKiraci?.firstName?.trim() && body.newKiraci?.lastName?.trim()) {
    await db.insert(tables.unitContacts).values({
      unitId: unit.id,
      firstName: body.newKiraci.firstName.trim(),
      lastName: body.newKiraci.lastName.trim(),
      phone: body.newKiraci.phone || null,
      email: body.newKiraci.email || null,
      role: 'kiraci'
    })
  }

  return { transferred: virtualUnitId !== null, virtualUnitId, virtualUnitNumber }
})
