import type { Database } from '../../../utils/drizzle'

interface ContactInput {
  firstName: string
  lastName: string
  phone?: string
  email?: string
}

interface UpdateUnitPayload {
  blockId: number
  number: string
  malik: ContactInput
  kiraci?: ContactInput
}

async function upsertContact(db: Database, unitId: number, role: 'malik' | 'kiraci', contact: ContactInput) {
  const [existing] = await db
    .select()
    .from(tables.unitContacts)
    .where(and(eq(tables.unitContacts.unitId, unitId), eq(tables.unitContacts.role, role)))

  const values = {
    firstName: contact.firstName.trim(),
    lastName: contact.lastName.trim(),
    phone: contact.phone || null,
    email: contact.email || null
  }

  if (existing) {
    await db.update(tables.unitContacts).set(values).where(eq(tables.unitContacts.id, existing.id))
  } else {
    await db.insert(tables.unitContacts).values({ unitId, role, ...values })
  }
}

export default defineEventHandler(async (event) => {
  await requireAdminWriteAccess(event)
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody<UpdateUnitPayload>(event)

  if (!id || !body.blockId || !body.number?.trim() || !body.malik?.firstName?.trim() || !body.malik?.lastName?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Blok, daire no ve malik adı/soyadı gerekli.' })
  }

  const db = useDrizzle()

  try {
    await db
      .update(tables.units)
      .set({ blockId: body.blockId, number: body.number.trim() })
      .where(eq(tables.units.id, id))
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'Bu blokta bu numarada bir daire zaten var.' })
  }

  await upsertContact(db, id, 'malik', body.malik)

  if (body.kiraci?.firstName?.trim() && body.kiraci?.lastName?.trim()) {
    await upsertContact(db, id, 'kiraci', body.kiraci)
  } else {
    // Kiracı gönderilmediyse taşınmış demektir, o daireden sonra malik sorumlu olur.
    await db.delete(tables.unitContacts).where(and(eq(tables.unitContacts.unitId, id), eq(tables.unitContacts.role, 'kiraci')))
  }

  const [updated] = await db.select().from(tables.units).where(eq(tables.units.id, id))
  return updated
})
