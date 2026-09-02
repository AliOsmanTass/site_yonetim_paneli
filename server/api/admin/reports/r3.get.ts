// Tazminat listesi raporu (detaylı). Query: ?format=pdf|xlsx.
import { getR3Rows } from '../../../utils/report-r3'
import { buildTabularPdf, buildTabularXlsx, tabularReportFilename, type TabularColumn } from '../../../utils/tabular-report'

const COLUMNS: TabularColumn[] = [
  { label: 'Evrak Tarihi', width: 70, type: 'date' },
  { label: 'Tazminat Başl.', width: 70, type: 'date' },
  { label: 'Daire / Açıklama', width: 220, type: 'text' },
  { label: 'Anapara (₺)', width: 80, type: 'currency' },
  { label: 'Gec. Gün', width: 60, type: 'text' },
  { label: 'Tazminat (₺)', width: 80, type: 'currency' }
]

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const format = String(getQuery(event).format ?? 'pdf')
  if (format !== 'pdf' && format !== 'xlsx') {
    throw createError({ statusCode: 400, statusMessage: 'Geçersiz format.' })
  }

  const db = useDrizzle()
  const [settings] = await db.select().from(tables.siteSettings).where(eq(tables.siteSettings.id, 1))
  const rows = await getR3Rows(db)

  const totalsRow = ['', '', 'Toplam', rows.reduce((s, r) => s + r.principal, 0), '', rows.reduce((s, r) => s + r.penalty, 0)]

  const input = {
    siteName: settings?.siteName ?? '',
    title: 'R3 — Tazminat Listesi',
    columns: COLUMNS,
    rows: rows.map((r) => [r.documentDate, r.penaltyStartDate, r.unitLabel, r.principal, r.days, r.penalty]),
    totalsRow
  }

  const buffer = format === 'pdf' ? await buildTabularPdf(input) : buildTabularXlsx(input)

  setHeader(event, 'Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', `attachment; filename="${tabularReportFilename('R3', format)}"`)
  return buffer
})
