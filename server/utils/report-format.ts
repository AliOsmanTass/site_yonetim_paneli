// Tüm raporların PDF/Excel üreticileri arasında paylaşılan biçimlendirme
// fonksiyonları.
export function formatCurrency(value: number): string {
  return value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ISO tarihi "GG.AA.YYYY" biçimine çevirir.
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}
