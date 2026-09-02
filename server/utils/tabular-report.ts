// Basit tablo raporları için genel üretici
import { PDFDocument, rgb } from 'pdf-lib'
import * as XLSX from 'xlsx'
import { formatCurrency, formatDate } from './report-format'
import { embedTurkishFonts } from './pdf-fonts'

export type TabularColumnType = 'text' | 'date' | 'currency'

export interface TabularColumn {
  label: string
  width: number
  type: TabularColumnType
}

export type TabularCell = string | number | null

export interface TabularReportInput {
  siteName: string
  title: string
  subtitle?: string
  columns: TabularColumn[]
  rows: TabularCell[][]
  totalsRow?: TabularCell[]
}

// Ham hücre değerini, sütun tipine göre görünecek metne çevirir.
function renderCellText(value: TabularCell, type: TabularColumnType): string {
  if (value == null || value === '') return '' // boş hücre boş kalsın
  if (type === 'date') return formatDate(String(value))
  if (type === 'currency') return formatCurrency(Number(value))
  return String(value)
}

const PAGE_WIDTH = 595.28// A4 
const PAGE_HEIGHT = 841.89 
const MARGIN = 40

// Düz tablo raporunu PDF olarak üretir.
export async function buildTabularPdf(input: TabularReportInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const { font, boldFont } = await embedTurkishFonts(doc)

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN

  function drawTableHeader() {
    let x = MARGIN
    for (const col of input.columns) {
      page.drawText(col.label, { x, y, size: 8, font: boldFont })
      x += col.width
    }
    y -= 10
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) })
    y -= 14
  }

  function newPageIfNeeded() {
    if (y < MARGIN + 30) { // sayfa sonuna yaklaşıldıysa yeni sayfaya geç
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
      drawTableHeader()
    }
  }

  page.drawText(input.siteName, { x: MARGIN, y, size: 14, font: boldFont })
  y -= 20
  page.drawText(input.title, { x: MARGIN, y, size: 12, font: boldFont })
  y -= 16
  if (input.subtitle) { // alt başlık opsiyonel
    page.drawText(input.subtitle, { x: MARGIN, y, size: 10, font })
    y -= 16
  }
  y -= 8

  drawTableHeader()

  for (const row of input.rows) {
    newPageIfNeeded()
    let x = MARGIN
    row.forEach((cell, i) => {
      const text = renderCellText(cell, input.columns[i]!.type)
      page.drawText(text, { x, y, size: 8, font })
      x += input.columns[i]!.width
    })
    y -= 18
  }

  if (input.totalsRow) { // toplam satırı istenmişse en alta çiz
    newPageIfNeeded()
    y -= 6
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) })
    y -= 14
    let x = MARGIN
    input.totalsRow.forEach((cell, i) => {
      const text = renderCellText(cell, input.columns[i]!.type)
      page.drawText(text, { x, y, size: 8, font: boldFont })
      x += input.columns[i]!.width
    })
  }

  return doc.save()
}

// Düz tablo raporunu Excel olarak üretir.
export function buildTabularXlsx(input: TabularReportInput): Uint8Array {
  const aoa: (string | number)[][] = [[input.siteName], [input.title]]
  if (input.subtitle) aoa.push([input.subtitle]) // alt başlık opsiyonel
  aoa.push([])
  aoa.push(input.columns.map((c) => c.label))

  const headerRowIndex = aoa.length // başlık satırının 1-based Excel numarası

  for (const row of input.rows) {
    aoa.push(row.map((cell, i) => {
      if (cell == null || cell === '') return '' // boş hücre boş kalsın
      if (input.columns[i]!.type === 'date') return formatDate(String(cell)) // Excel'de tarihi elle formatlıyoruz
      return cell
    }))
  }
  const lastDataRow = aoa.length // son veri satırının 1-based Excel numarası

  let totalExcelRow: number | null = null
  if (input.totalsRow) { // toplam satırı istenmişse en alta ekle
    totalExcelRow = lastDataRow + 1
    aoa.push(input.totalsRow.map((cell, i) => {
      if (cell == null || cell === '') return ''
      return input.columns[i]!.type === 'date' ? formatDate(String(cell)) : cell
    }))
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const moneyFormat = '#.##0,00'
  const firstDataExcelRow = headerRowIndex + 1

  input.columns.forEach((col, i) => {
    if (col.type !== 'currency') return // sadece para sütunlarına biçim/formül ver
    const colLetter = XLSX.utils.encode_col(i)
    for (let r = firstDataExcelRow; r <= lastDataRow; r++) {
      const cell = ws[`${colLetter}${r}`]
      if (cell && typeof cell.v === 'number') cell.z = moneyFormat // sayısal değilse dokunma
    }
    if (totalExcelRow) { // toplam satırı varsa SUM formülü yaz
      ws[`${colLetter}${totalExcelRow}`] = { t: 'n', f: `SUM(${colLetter}${firstDataExcelRow}:${colLetter}${lastDataRow})`, z: moneyFormat }
    }
  })

  ws['!cols'] = input.columns.map((c) => ({ wch: Math.max(10, Math.round(c.width / 6)) }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Rapor')

  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
}

// İndirilen dosyanın adını üretir.
export function tabularReportFilename(slug: string, format: 'pdf' | 'xlsx'): string {
  const month = new Date().toISOString().slice(0, 7)
  return `rapor_${slug}_${month}.${format}`
}
