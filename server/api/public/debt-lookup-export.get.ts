// Açık erişimden ekstre indirme — isim maskeli sürüm. debt-lookup.get.ts
// ile aynı sorguyu kullanır, sadece PDF/Excel üretip döner.
import { alias } from 'drizzle-orm/sqlite-core'
import { getUnitStatementData } from '../../utils/get-unit-statement'
import { maskContactName } from '../../utils/mask'
import { buildR1Pdf, buildR1Xlsx, reportFilename } from '../../utils/r1-report'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const blockName = String(query.block ?? '').trim()
  const number = String(query.number ?? '').trim()
  const format = String(query.format ?? 'pdf')

  if (!blockName || !number || (format !== 'pdf' && format !== 'xlsx')) {
    throw createError({ statusCode: 400, statusMessage: 'Blok, daire no ve format gerekli.' })
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

  const [settings] = await db.select().from(tables.siteSettings).where(eq(tables.siteSettings.id, 1))
  const { rows } = await getUnitStatementData(db, unit.id)

  const unitLabel = `${unit.blockName}-${unit.number}`
  const ownerName = unit.malikFirstName && unit.malikLastName ? maskContactName(unit.malikFirstName, unit.malikLastName) : '-'
  const input = {
    siteName: settings?.siteName ?? '',
    unitLabel,
    ownerName,
    periodStart: rows[0]?.date ?? new Date().toISOString().slice(0, 10),
    periodEnd: new Date().toISOString().slice(0, 10),
    rows
  }

  const buffer = format === 'pdf' ? await buildR1Pdf(input) : buildR1Xlsx(input)

  setHeader(event, 'Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', `attachment; filename="${reportFilename(unitLabel, format)}"`)
  return buffer
})
