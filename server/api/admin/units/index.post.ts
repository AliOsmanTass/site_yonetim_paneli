interface ContactInput {
  firstName: string
  lastName: string
  phone?: string
  email?: string
}

interface CreateUnitPayload {
  blockId: number
  number: string
  malik: ContactInput
  kiraci?: ContactInput
}

export default defineEventHandler(async (event) => {
  await requireAdminWriteAccess(event)
  const body = await readBody<CreateUnitPayload>(event)

  if (!body.blockId || !body.number?.trim() || !body.malik?.firstName?.trim() || !body.malik?.lastName?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Blok, daire no ve malik adı/soyadı gerekli.' })
  }

  const db = useDrizzle()
  let unit: typeof tables.units.$inferSelect

  try {
    const [inserted] = await db
      .insert(tables.units)
      .values({ blockId: body.blockId, number: body.number.trim() })
      .returning()
    unit = inserted
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'Bu blokta bu numarada bir daire zaten var.' })
  }

  await db.insert(tables.unitContacts).values({
    unitId: unit.id,
    firstName: body.malik.firstName.trim(),
    lastName: body.malik.lastName.trim(),
    phone: body.malik.phone || null,
    email: body.malik.email || null,
    role: 'malik'
  })

  if (body.kiraci?.firstName?.trim() && body.kiraci?.lastName?.trim()) {
    await db.insert(tables.unitContacts).values({
      unitId: unit.id,
      firstName: body.kiraci.firstName.trim(),
      lastName: body.kiraci.lastName.trim(),
      phone: body.kiraci.phone || null,
      email: body.kiraci.email || null,
      role: 'kiraci'
    })
  }

  return unit
})
