import { describe, expect, it } from 'vitest'
import { buildRateSegments, calculatePenalty, roundCurrency } from '../../server/utils/penalty'

describe('calculatePenalty', () => {
  // sabit bir orana göre, gecikme günü sayısı kadar tazminat doğru hesaplanıyor mu.
  it('4.700 ₺, %5 oran, 28 gün gecikme → 219,33 ₺', () => {
    const rateSegments = buildRateSegments([{ rate: 0.05, effectiveFrom: '2000-01-01' }])
    const result = calculatePenalty({
      principal: 4700,
      penaltyStartDate: '2026-06-09',
      asOfDate: '2026-07-07',
      rateSegments
    })
    expect(result.days).toBe(28)
    expect(result.amount).toBe(219.33)
  })

  // Bazı borç türlerinde hiç tazminat
  // başlangıç tarihi yoktur. Bu durumda sonuç her zaman sıfır olmalı
  it('penaltyStartDate null ise tazminat işlemez (tazminatsız borç türü)', () => {
    const rateSegments = buildRateSegments([{ rate: 0.05, effectiveFrom: '2000-01-01' }])
    const result = calculatePenalty({
      principal: 4700,
      penaltyStartDate: null,
      asOfDate: '2026-07-07',
      rateSegments
    })
    expect(result).toEqual({ amount: 0, days: 0 })
  })

  // Henüz gecikme başlamadan ya da tam başlangıç gününde sorgulanırsa, işlemiş
  // gün sayısı 0 olduğu için tazminat da 0 çıkmalı 
  it('asOfDate tazminat başlangıcından önce/eşitse tazminat işlemez', () => {
    const rateSegments = buildRateSegments([{ rate: 0.05, effectiveFrom: '2000-01-01' }])
    const result = calculatePenalty({
      principal: 4700,
      penaltyStartDate: '2026-06-09',
      asOfDate: '2026-06-09',
      rateSegments
    })
    expect(result).toEqual({ amount: 0, days: 0 })
  })

  // gecikme süresi içinde tazminat oranı değişirse (%5 → %4),
  // her günün kendi dönemindeki oranla sayılıp sayılmadığını doğruluyor — tek bir
  // orana göre yanlış toplu hesap yapılmamalı.
  it('oran değişikliği: gecikme dönemi iki segmente yayılırsa her gün kendi dönemindeki oranla hesaplanır', () => {
    const rateSegments = buildRateSegments([
      { rate: 0.05, effectiveFrom: '2000-01-01' },
      { rate: 0.04, effectiveFrom: '2026-06-01' }
    ])
    // Tazminat başlangıcı 2026-05-01 (31 gün %5), 2026-06-01'den itibaren %4,
    // rapor günü 2026-06-11 (10 gün %4) → toplam 41 gün, 242,83 + 62,67 = 305,50 ₺
    const result = calculatePenalty({
      principal: 4700,
      penaltyStartDate: '2026-05-01',
      asOfDate: '2026-06-11',
      rateSegments
    })
    expect(result.days).toBe(41)
    expect(result.amount).toBe(305.5)
  })

  // borç, elimizdeki en eski oran kaydından bile önce gecikmeye başlamışsa
  // yani site sonradan kurulmuş, geçmiş oran bilgisi eksikse o aralık atlanmamalı,
  // bildiğimiz en eski oranla hesaba dahil edilmeli.
  it('tazminat başlangıcı, oran geçmişinin ilk noktasından önceyse en eski bilinen oranla hesaplanır (0 gün sayılmaz)', () => {
    // setting_history ilk kez 2026-07-10'da yazılmış olsun (site sonradan kuruldu),
    // ama borcun tazminatı 2026-06-06'da başlamış — bu aralık "bilinmiyor" diye
    // atlanmamalı, en eski bilinen oranla (%5) hesaplanmalı.
    const rateSegments = buildRateSegments([{ rate: 0.05, effectiveFrom: '2026-07-10' }])
    const result = calculatePenalty({
      principal: 4700,
      penaltyStartDate: '2026-06-06',
      asOfDate: '2026-07-13',
      rateSegments
    })
    // 2026-06-06 → 2026-07-13 = 37 gün, hepsi %5 ile (tek segment var)
    expect(result.days).toBe(37)
    expect(result.amount).toBe(289.83)
  })
})

describe('buildRateSegments', () => {
  // Şu ana kadar hiç oran değişmemişse, tek bir oran her zaman geçerli olmalı.
  it('tek nokta verilirse sonsuza kadar geçerli tek segment üretir', () => {
    const segments = buildRateSegments([{ rate: 0.05, effectiveFrom: '2026-01-01' }])
    expect(segments).toEqual([{ rate: 0.05, effectiveFrom: '2026-01-01', effectiveTo: null }])
  })

  // Oran geçmişi veritabanından hangi sırayla gelirse gelsin, fonksiyon kendisi
  // tarihe göre sıralayıp aralarında boşluk kalmayan bir zaman çizelgesi kurmalı.
  it('sırasız girdi verilse bile kronolojik, boşluksuz segmentler üretir', () => {
    const segments = buildRateSegments([
      { rate: 0.04, effectiveFrom: '2026-06-01' },
      { rate: 0.05, effectiveFrom: '2026-01-01' }
    ])
    expect(segments).toEqual([
      { rate: 0.05, effectiveFrom: '2026-01-01', effectiveTo: '2026-06-01' },
      { rate: 0.04, effectiveFrom: '2026-06-01', effectiveTo: null }
    ])
  })
})

describe('roundCurrency', () => {
  // Ondalıklı ara işlemlerden gelen uzun küsuratları (219.3333...) parasal olarak
  // anlamlı 2 basamağa (kuruş) yuvarlıyor mu.
  it('kuruşa yuvarlar', () => {
    expect(roundCurrency(219.3333333)).toBe(219.33)
    expect(roundCurrency(62.66666667)).toBe(62.67)
  })
})
