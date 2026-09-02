// Giriş yapmadan borç sorgusu. Blok + daire no ile daireyi bulur, admin
// ekstresiyle aynı hesabı kullanır ama ismi maskeler. Telefon ve e-posta
// bu yanıta hiç girmez.
import { alias } from 'drizzle-orm/sqlite-core'
import { getUnitStatementData } from '../../utils/get-unit-statement'
import { maskContactName } from '../../utils/mask'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const blockName = String(query.block ?? '').trim()
  const number = String(query.number ?? '').trim()

  if (!blockName || !number) {
    throw createError({ statusCode: 400, statusMessage: 'Blok ve daire no gerekli.' })
  }

  const db = useDrizzle()
  const malikContacts = alias(tables.unitContacts, 'malikContacts')

  const [unit] = await db
    .select({
      id: tables.units.id,
      blockName: tables.blocks.name,
      number: tables.units.number,
      malikFirstName: malikContacts.firstName,
      malikLastName: malikContacts.lastName
    })
    .from(tables.units)
    .innerJoin(tables.blocks, eq(tables.units.blockId, tables.blocks.id))
    .leftJoin(malikContacts, and(eq(malikContacts.unitId, tables.units.id), eq(malikContacts.role, 'malik')))
    .where(and(eq(tables.blocks.name, blockName), eq(tables.units.number, number), eq(tables.units.isVirtual, false)))

  if (!unit) {
    throw createError({ statusCode: 404, statusMessage: 'Bu blok ve daire numarasında kayıt bulunamadı.' })
  }

  const { summary, rows } = await getUnitStatementData(db, unit.id)

  return {
    unitLabel: `${unit.blockName}-${unit.number}`,
    ownerInitials: unit.malikFirstName && unit.malikLastName ? maskContactName(unit.malikFirstName, unit.malikLastName) : null,
    summary,
    rows
  }
})
