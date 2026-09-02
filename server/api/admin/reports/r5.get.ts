// Aylık kasa raporu. 
// Bölüm/Kalem/Tutar tablosunu genel tablo üreticisiyle (tabular-report.ts)
import { getR5Data } from '../../../utils/report-r5'
import { buildTabularPdf, buildTabularXlsx, tabularReportFilename, type TabularCell, type TabularColumn } from '../../../utils/tabular-report'

const COLUMNS: TabularColumn[] = [
  { label: 'Bölüm', width: 90, type: 'text' },
  { label: 'Kalem', width: 260, type: 'text' },
  { label: 'Tutar (₺)', width: 90, type: 'currency' }
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
  const data = await getR5Data(db, month)

  const rows: TabularCell[][] = [['Devir', 'Dönem başı devir', data.devir]]

  const section = (title: string, lines: { label: string; amount: number }[], negate: boolean) => {
    lines.forEach((line, i) => {
      rows.push([i === 0 ? title : '', line.label, negate ? -line.amount : line.amount])
    })
  }
  section('Gelirler', data.gelirler, false)
  section('Giderler', data.giderler, true)
  section('Demirbaş Fonu', data.demirbasFonu, true)

  const input = {
    siteName: settings?.siteName ?? '',
    title: 'R5 — Aylık Kasa Raporu',
    subtitle: `Dönem: ${month}`,
    columns: COLUMNS,
    rows,
    totalsRow: ['Sonuç', 'Dönem sonu bakiye', data.sonuc] as TabularCell[]
  }

  const buffer = format === 'pdf' ? await buildTabularPdf(input) : buildTabularXlsx(input)

  setHeader(event, 'Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', `attachment; filename="${tabularReportFilename('R5', format)}"`)
  return buffer
})
