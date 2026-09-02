import { describe, expect, it } from 'vitest'
import { splitEqually } from '../../server/utils/split'

describe('splitEqually', () => {
  // Bir tutar çok sayıda paya bölünüp tam bölünmüyorsa, ilk paylar birbirine eşit
  // kalırken kuruş küsuratı son paya yazılmalı, toplam yine orijinal tutara eşit olmalı.
  it('toplamı korur, kuruş farkını son elemana yansıtır', () => {
    const shares = splitEqually(16740, 62)
    expect(shares).toHaveLength(62)
    const sum = shares.reduce((a, b) => a + b, 0)
    expect(Math.round(sum * 100) / 100).toBe(16740)
    // ilk 61 pay eşit, son pay farklı (kuruş farkı orada toplanıyor)
    expect(new Set(shares.slice(0, -1)).size).toBe(1)
  })

  // Tutar payların sayısına tam bölünüyorsa, hiçbir payın diğerinden farklı
  // olmasına gerek yok.
  it('tam bölünen tutarda tüm paylar eşittir', () => {
    const shares = splitEqually(100, 4)
    expect(shares).toEqual([25, 25, 25, 25])
  })

  // Bölünecek kimse (daire) yoksa hata fırlatmak yerine boş bir liste dönmeli.
  it('count 0 ise boş dizi döner', () => {
    expect(splitEqually(100, 0)).toEqual([])
  })
})
