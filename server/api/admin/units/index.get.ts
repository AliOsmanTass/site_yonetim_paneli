// Tüm daireleri blok adı + malik/kiracı bilgisiyle birlikte döner. Arama ve
// sayfalama istemci tarafında yapılıyor
import { alias } from 'drizzle-orm/sqlite-core'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)

  const malikContacts = alias(tables.unitContacts, 'malikContacts')
  const kiraciContacts = alias(tables.unitContacts, 'kiraciContacts')

  return useDrizzle()
    .select({
      id: tables.units.id,
      blockId: tables.units.blockId,
      blockName: tables.blocks.name,
      number: tables.units.number,
      isVirtual: tables.units.isVirtual,
      malikFirstName: malikContacts.firstName,
      malikLastName: malikContacts.lastName,
      malikPhone: malikContacts.phone,
      malikEmail: malikContacts.email,
      kiraciFirstName: kiraciContacts.firstName,
      kiraciLastName: kiraciContacts.lastName,
      kiraciPhone: kiraciContacts.phone,
      kiraciEmail: kiraciContacts.email
    })
    .from(tables.units)
    .innerJoin(tables.blocks, eq(tables.units.blockId, tables.blocks.id))
    .leftJoin(malikContacts, and(eq(malikContacts.unitId, tables.units.id), eq(malikContacts.role, 'malik')))
    .leftJoin(kiraciContacts, and(eq(kiraciContacts.unitId, tables.units.id), eq(kiraciContacts.role, 'kiraci')))
    .orderBy(tables.blocks.name, tables.units.number)
})
