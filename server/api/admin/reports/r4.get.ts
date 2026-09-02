// Birleşik borç raporu — borç listesi ekranındaki verinin dışa aktarımı.
// Query: ?format=pdf|xlsx.
import { getDebtsOverview } from '../../../utils/debts-overview'
import { buildTabularPdf, buildTabularXlsx, tabularReportFilename, type TabularColumn } from '../../../utils/tabular-report'

const COLUMNS: TabularColumn[] = [
  { label: 'Blok', width: 50, type: 'text' },
  { label: 'Daire', width: 50, type: 'text' },
  { label: 'Yetkili', width: 150, type: 'text' },
  { label: 'Anapara (₺)', width: 100, type: 'currency' },
  { label: 'Açık Tazminat (₺)', width: 100, type: 'currency' },
  { label: 'Toplam (₺)', width: 90, type: 'currency' }
]

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const format = String(getQuery(event).format ?? 'pdf')
  if (format !== 'pdf' && format !== 'xlsx') {
    throw createError({ statusCode: 400, statusMessage: 'Geçersiz format.' })
  }

  const db = useDrizzle()
  const [settings] = await db.select().from(tables.siteSettings).where(eq(tables.siteSettings.id, 1))
  const overview = await getDebtsOverview(db)

  const totalsRow = [
    '', '', 'Toplam',
    overview.reduce((s, u) => s + u.openDebt, 0),
    overview.reduce((s, u) => s + u.penalty, 0),
    overview.reduce((s, u) => s + u.total, 0)
  ]

  const input = {
    siteName: settings?.siteName ?? '',
    title: 'R4 — Birleşik Borç Raporu',
    columns: COLUMNS,
    rows: overview.map((u) => [u.blockName, u.number, u.ownerName ?? '-', u.openDebt, u.penalty, u.total]),
    totalsRow
  }

  const buffer = format === 'pdf' ? await buildTabularPdf(input) : buildTabularXlsx(input)

  setHeader(event, 'Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', `attachment; filename="${tabularReportFilename('R4', format)}"`)
  return buffer
})
