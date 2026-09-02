// Daire ekstresini PDF/Excel olarak indirir (admin, maskesiz sürüm).
import { alias } from 'drizzle-orm/sqlite-core'
import { getUnitStatementData } from '../../../../utils/get-unit-statement'
import { buildR1Pdf, buildR1Xlsx, reportFilename } from '../../../../utils/r1-report'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const unitId = Number(getRouterParam(event, 'unitId'))
  const format = String(getQuery(event).format ?? 'pdf')
  if (!unitId || (format !== 'pdf' && format !== 'xlsx')) {
    throw createError({ statusCode: 400, statusMessage: 'Geçersiz daire id veya format.' })
  }

  const db = useDrizzle()
  const malikContacts = alias(tables.unitContacts, 'malikContacts')

  const [unit] = await db
    .select({
      blockName: tables.blocks.name,
      number: tables.units.number,
      malikFirstName: malikContacts.firstName,
      malikLastName: malikContacts.lastName
    })
    .from(tables.units)
    .innerJoin(tables.blocks, eq(tables.units.blockId, tables.blocks.id))
    .leftJoin(malikContacts, and(eq(malikContacts.unitId, tables.units.id), eq(malikContacts.role, 'malik')))
    .where(eq(tables.units.id, unitId))

  if (!unit) {
    throw createError({ statusCode: 404, statusMessage: 'Daire bulunamadı.' })
  }

  const [settings] = await db.select().from(tables.siteSettings).where(eq(tables.siteSettings.id, 1))
  const { rows } = await getUnitStatementData(db, unitId)

  const unitLabel = `${unit.blockName}-${unit.number}`
  const ownerName = unit.malikFirstName && unit.malikLastName ? `${unit.malikFirstName} ${unit.malikLastName}` : '-'
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
