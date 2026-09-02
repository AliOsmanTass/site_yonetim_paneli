// Aylık borç detay raporu. Query: ?month=YYYY-MM&format=pdf|xlsx.
import { getR2Rows } from '../../../utils/report-r2'
import { buildTabularPdf, buildTabularXlsx, tabularReportFilename, type TabularColumn } from '../../../utils/tabular-report'

const COLUMNS: TabularColumn[] = [
  { label: 'Blok', width: 50, type: 'text' },
  { label: 'Daire', width: 50, type: 'text' },
  { label: 'Yetkili', width: 150, type: 'text' },
  { label: 'Borç (₺)', width: 90, type: 'currency' },
  { label: 'Ödeme (₺)', width: 90, type: 'currency' },
  { label: 'Kalan (₺)', width: 90, type: 'currency' }
]

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const query = getQuery(event)
  const month = String(query.month ?? new Date().toISOString().slice(0, 7))
  const format = String(query.format ?? 'pdf')
  if (format !== 'pdf' && format !== 'xlsx') {
    throw createError({ statusCode: 400, statusMessage: 'Geçersiz format.' })
  }

  const db = useDrizzle()
  const [settings] = await db.select().from(tables.siteSettings).where(eq(tables.siteSettings.id, 1))
  const rows = await getR2Rows(db, month)

  const totalsRow = [
    '', '', 'Toplam',
    rows.reduce((s, r) => s + r.monthDebt, 0),
    rows.reduce((s, r) => s + r.monthPayment, 0),
    rows.reduce((s, r) => s + r.remaining, 0)
  ]

  const input = {
    siteName: settings?.siteName ?? '',
    title: 'R2 — Aylık Borç Detay Raporu',
    subtitle: `Dönem: ${month}`,
    columns: COLUMNS,
    rows: rows.map((r) => [r.blockName, r.number, r.ownerName ?? '-', r.monthDebt, r.monthPayment, r.remaining]),
    totalsRow
  }

  const buffer = format === 'pdf' ? await buildTabularPdf(input) : buildTabularXlsx(input)

  setHeader(event, 'Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', `attachment; filename="${tabularReportFilename('R2', format)}"`)
  return buffer
})
