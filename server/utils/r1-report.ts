// Daire hesap ekstresi — PDF ve Excel üretimi.
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib'
// bkz. tabular-report.ts — cpexcel.js/Vercel sorunundan kaçınmak için ESM girişi
import * as XLSX from 'xlsx/xlsx.mjs'
import type { StatementRow } from './statement'
import { formatCurrency, formatDate } from './report-format'
import { embedTurkishFonts } from './pdf-fonts'

export interface R1ReportInput {
  siteName: string
  unitLabel: string
  ownerName: string
  periodStart: string
  periodEnd: string
  rows: StatementRow[]
}

// Ekstre satırlarındaki borç/tazminat/ödeme toplamlarını ve son bakiyeyi hesaplar.

function computeTotals(rows: StatementRow[]) {
  return {
    debt: rows.reduce((sum, r) => sum + (r.debtAmount ?? 0), 0),
    penalty: rows.reduce((sum, r) => sum + (r.kind === 'debt' ? (r.penaltyAmount ?? 0) : 0), 0),
    payment: rows.reduce((sum, r) => sum + (r.paymentAmount ?? 0), 0),
    balance: rows.length ? rows[rows.length - 1]!.balance : 0
  }
}

// İndirilecek dosyanın uzantısız adını üretir.
function reportFilenameBase(unitLabel: string): string {
  const month = new Date().toISOString().slice(0, 7)
  return `rapor_${unitLabel}_${month}`
}

// PDF 
// A4 formatı
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 32
const COLS = [
  { label: 'Evrak Tarihi', width: 64 },
  { label: 'Son Ödeme', width: 62 },
  { label: 'Açıklama', width: 118 },
  { label: 'Borç (₺)', width: 55 },
  { label: 'Açık Tazminat (₺)', width: 93 },
  { label: 'Alacak (₺)', width: 60 },
  { label: 'Bakiye (₺)', width: 60 }
]
const TABLE_RIGHT = MARGIN + COLS.reduce((sum, col) => sum + col.width, 0)
const GRID_OFFSET = 6

const CELL_X_OFFSET = [0, 0, 0, 0, 6, 0, 0]

function fitText(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let truncated = text
  while (truncated.length > 1 && font.widthOfTextAtSize(`${truncated}...`, size) > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  return `${truncated}...`
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
    } else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

function wrapTitle(font: PDFFont, title: string, size: number, maxWidth: number): string[] {
  const sepIndex = title.indexOf(' — ')
  if (sepIndex === -1) return wrapText(font, title, size, maxWidth)
  return [
    ...wrapText(font, title.slice(0, sepIndex), size, maxWidth),
    ...wrapText(font, title.slice(sepIndex + 1), size, maxWidth)
  ]
}

// Daire ekstresini PDF olarak üretir.
export async function buildR1Pdf(input: R1ReportInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const { font, boldFont } = await embedTurkishFonts(doc)

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN
  let tableTopY = y

  function drawVerticalLines(bottomY: number) {
    let vx = MARGIN
    for (const col of COLS) {
      page.drawLine({ start: { x: vx - GRID_OFFSET, y: tableTopY }, end: { x: vx - GRID_OFFSET, y: bottomY }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) })
      vx += col.width
    }
    page.drawLine({ start: { x: vx - GRID_OFFSET, y: tableTopY }, end: { x: vx - GRID_OFFSET, y: bottomY }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) })
  }

  function drawRowSeparator() {
    page.drawLine({ start: { x: MARGIN - GRID_OFFSET, y }, end: { x: TABLE_RIGHT - GRID_OFFSET, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) })
  }

  function drawTableHeader() {
    let x = MARGIN
    for (const col of COLS) {
      page.drawText(col.label, { x, y, size: 8, font: boldFont, color: rgb(0, 0, 0) })
      x += col.width
    }
    y -= 10
    page.drawLine({ start: { x: MARGIN - GRID_OFFSET, y }, end: { x: TABLE_RIGHT - GRID_OFFSET, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) })
    tableTopY = y
    y -= 14
  }

  function newPageIfNeeded() {
    if (y < MARGIN + 30) {
      drawVerticalLines(y)
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
      drawTableHeader()
    }
  }
  
  page.drawText(input.siteName, { x: MARGIN, y, size: 14, font: boldFont })
  y -= 20
  page.drawText(`Dönem: ${formatDate(input.periodStart)} - ${formatDate(input.periodEnd)}`, { x: MARGIN, y, size: 10, font })
  y -= 14
  page.drawText(`Daire: ${input.unitLabel}`, { x: MARGIN, y, size: 10, font })
  y -= 14
  page.drawText(`Yetkili: ${input.ownerName}`, { x: MARGIN, y, size: 10, font })
  y -= 20


  const totals = computeTotals(input.rows)
  page.drawText(`Toplam Bakiye: ${formatCurrency(totals.balance)} ₺`, { x: MARGIN, y, size: 11, font: boldFont })
  y -= 24

  drawTableHeader()

  input.rows.forEach((row, rowIndex) => {
    newPageIfNeeded()
    let x = MARGIN
    const descColX = MARGIN + COLS[0]!.width + COLS[1]!.width
    const titleWrapWidth = COLS[2]!.width - 10
    const titleLines = wrapTitle(font, row.title, 8, titleWrapWidth)
    const cells = [
      formatDate(row.date),
      formatDate(row.dueDate),
      titleLines[0] ?? '',
      row.debtAmount != null ? formatCurrency(row.debtAmount) : '',
      row.kind === 'debt' && row.penaltyAmount != null ? formatCurrency(row.penaltyAmount) : '',
      row.paymentAmount != null ? formatCurrency(row.paymentAmount) : '',
      formatCurrency(row.balance)
    ]
    cells.forEach((cell, i) => {
      page.drawText(cell, { x: x + CELL_X_OFFSET[i]!, y, size: 8, font })
      x += COLS[i]!.width
    })
    // Açıklama sütuna sığmayıp taştıysa devamı alt satırlara yazılıyor.
    for (let li = 1; li < titleLines.length; li++) {
      y -= 10
      newPageIfNeeded()
      page.drawText(titleLines[li]!, { x: descColX, y, size: 8, font })
    }
    // Tek kalemli kırılım, üstteki satırın tekrarı olduğundan gösterilmiyor. Çok kalemli kırılım ise alt satırlara yazılıyor.
    if (row.items && row.items.length > 1) {
      // Kalem bloğu üstteki satırla altındaki satır
      y -= 14
      const itemX = descColX + 6
      const itemMaxWidth = PAGE_WIDTH - MARGIN - itemX
      for (const item of row.items) {
        newPageIfNeeded()
        const itemText = fitText(font, `- ${item.description}: ${formatCurrency(item.lineTotal)} ₺`, 7, itemMaxWidth)
        page.drawText(itemText, { x: itemX, y, size: 7, font, color: rgb(0.4, 0.4, 0.4) })
        y -= 10
      }
      y -= 3
      if (rowIndex < input.rows.length - 1) drawRowSeparator()
      y -= 5
    } else {
      y -= 10
      if (rowIndex < input.rows.length - 1) drawRowSeparator()
      y -= 14
    }
  })

  newPageIfNeeded()
  y -= 6
  page.drawLine({ start: { x: MARGIN - GRID_OFFSET, y }, end: { x: TABLE_RIGHT - GRID_OFFSET, y }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) })
  y -= 14
  let x = MARGIN
  const totalCells = ['', '', 'Toplam', formatCurrency(totals.debt), formatCurrency(totals.penalty), formatCurrency(totals.payment), formatCurrency(totals.balance)]
  totalCells.forEach((cell, i) => {
    page.drawText(cell, { x: x + CELL_X_OFFSET[i]!, y, size: 8, font: boldFont })
    x += COLS[i]!.width
  })
  y -= 6
  page.drawLine({ start: { x: MARGIN - GRID_OFFSET, y }, end: { x: TABLE_RIGHT - GRID_OFFSET, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) })
  drawVerticalLines(y)

  return doc.save()
}

// --- Excel ---

// Daire ekstresini Excel olarak üretir.
export function buildR1Xlsx(input: R1ReportInput): Uint8Array {
  const totals = computeTotals(input.rows)

  const aoa: (string | number)[][] = [
    [input.siteName],
    [`Dönem: ${formatDate(input.periodStart)} – ${formatDate(input.periodEnd)}`],
    [`Daire: ${input.unitLabel}`],
    [`Yetkili: ${input.ownerName}`],
    [`Toplam Bakiye: ${formatCurrency(totals.balance)} ₺`],
    [],
    ['Evrak Tarihi', 'Son Ödeme', 'Açıklama', 'Borç (₺)', 'Açık Tazminat (₺)', 'Alacak (₺)', 'Bakiye (₺)']
  ]

  const headerRowIndex = aoa.length // az önce eklenen başlık satırının sırası
  for (const row of input.rows) {
    aoa.push([
      formatDate(row.date),
      formatDate(row.dueDate),
      row.title,
      row.debtAmount ?? '',
      row.kind === 'debt' ? (row.penaltyAmount ?? '') : '',
      row.paymentAmount ?? '',
      row.balance
    ])
    // Tek kalemli kırılım üstteki satırın tekrarı olduğundan gösterilmiyor.
    if (row.items && row.items.length > 1) {
      for (const item of row.items) {
        aoa.push(['', '', `   ${item.description}`, '', '', '', item.lineTotal])
      }
    }
  }
  const lastDataRow = aoa.length // son veri satırından hemen sonraki sıra
  aoa.push(['', '', 'Toplam', totals.debt, totals.penalty, totals.payment, totals.balance])

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Excel satırları 1'den başlar. headerRowIndex ve lastDataRow zaten push
  // sonrası aoa.length'ten geldiği için doğru satır numarasını veriyor,
  // ekstra +1 eklemeye gerek yok.
  const firstDataExcelRow = headerRowIndex + 1
  const lastDataExcelRow = lastDataRow
  const totalExcelRow = lastDataRow + 1

  const moneyFormat = '#.##0,00'
  for (let r = firstDataExcelRow; r <= lastDataExcelRow; r++) {
    for (const col of ['D', 'E', 'F', 'G']) {
      const cell = ws[`${col}${r}`]
      if (cell && typeof cell.v === 'number') cell.z = moneyFormat
    }
  }

  ws[`D${totalExcelRow}`] = { t: 'n', f: `SUM(D${firstDataExcelRow}:D${lastDataExcelRow})`, z: moneyFormat }
  ws[`E${totalExcelRow}`] = { t: 'n', f: `SUM(E${firstDataExcelRow}:E${lastDataExcelRow})`, z: moneyFormat }
  ws[`F${totalExcelRow}`] = { t: 'n', f: `SUM(F${firstDataExcelRow}:F${lastDataExcelRow})`, z: moneyFormat }
  ws[`G${totalExcelRow}`] = { t: 'n', f: `G${lastDataExcelRow}`, z: moneyFormat }

  ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 45 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Ekstre')

  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
}

// İndirilen dosyanın tam adını (uzantılı) üretir.
export function reportFilename(unitLabel: string, format: 'pdf' | 'xlsx'): string {
  return `${reportFilenameBase(unitLabel)}.${format}`
}
