// PDF raporlarında Türkçe karakterlerin (ğ, ı, ş, İ) ve ₺ işaretinin doğru
// görünmesi için gömülü DejaVu Sans fontu.
import fontkit from '@pdf-lib/fontkit'
import type { PDFDocument, PDFFont } from 'pdf-lib'

export interface TurkishFonts {
  font: PDFFont
  boldFont: PDFFont
}

export async function embedTurkishFonts(doc: PDFDocument): Promise<TurkishFonts> {
  doc.registerFontkit(fontkit)

  const storage = useStorage('assets:server')
  const [regular, bold] = await Promise.all([
    storage.getItemRaw('fonts:DejaVuSans.ttf'),
    storage.getItemRaw('fonts:DejaVuSans-Bold.ttf')
  ])

  const font = await doc.embedFont(regular as Uint8Array)
  const boldFont = await doc.embedFont(bold as Uint8Array)

  return { font, boldFont }
}
