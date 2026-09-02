import { describe, expect, it } from 'vitest'
import { allocatePayment } from '../../server/utils/allocation'
import { buildRateSegments } from '../../server/utils/penalty'

describe('allocatePayment', () => {
  const rateSegments = buildRateSegments([{ rate: 0.05, effectiveFrom: '2000-01-01' }])

  // Ödeme tutarı açık borçların toplamından azsa, en eski borçtan başlayarak
  // sırayla dağıtılıyor mu; ilk borç tam kapanıp kalanı ikinciye gidiyor mu.
  it('kısmi ödeme (A-14, iki 4.700 ₺ aidat + 5.000 ₺ ödeme)', () => {
    const result = allocatePayment({
      amount: 5000,
      paidAt: '2026-06-10',
      openDebts: [
        { debtId: 1, remainingPrincipal: 4700, penaltyStartDate: '2026-05-06' }, // Mayıs aidatı
        { debtId: 2, remainingPrincipal: 4700, penaltyStartDate: '2026-06-06' } // Haziran aidatı
      ],
      rateSegments
    })

    expect(result.allocations).toHaveLength(2)
    expect(result.allocations[0]).toMatchObject({ debtId: 1, principalAmount: 4700 })
    expect(result.allocations[1]).toMatchObject({ debtId: 2, principalAmount: 300 })
    expect(result.unallocatedAmount).toBe(0)

    // Haziran borcunun kapanmayan kısmı: 4.700 - 300 = 4.400 ₺ 
    const debt2RemainingAfter = 4700 - result.allocations[1].principalAmount
    expect(debt2RemainingAfter).toBe(4400)
  })

  // Tazminat işlemeyen bir borca ödeme yapılırsa, mahsupta tazminat tutarı
  // ve gün sayısı hep sıfır kalmalı.
  it('tazminatsız borçlarda (penaltyStartDate null) penaltyAmount her zaman 0 döner', () => {
    const result = allocatePayment({
      amount: 1000,
      paidAt: '2026-06-10',
      openDebts: [{ debtId: 1, remainingPrincipal: 1000, penaltyStartDate: null }],
      rateSegments
    })
    expect(result.allocations[0]).toMatchObject({ principalAmount: 1000, penaltyAmount: 0, penaltyDays: 0 })
  })

  // Girilen tutar açık borçtan fazlaysa, borç kadarı mahsup edilip fazlası
  // hiçbir borca yazılmadan ayrı bir alanda dönmeli.
  it('fazla ödeme: açık borçlardan büyük tutar girilirse kalan unallocatedAmount olarak döner', () => {
    const result = allocatePayment({
      amount: 6000,
      paidAt: '2026-06-10',
      openDebts: [{ debtId: 1, remainingPrincipal: 4700, penaltyStartDate: '2026-05-06' }],
      rateSegments
    })
    expect(result.allocations).toHaveLength(1)
    expect(result.allocations[0].principalAmount).toBe(4700)
    expect(result.unallocatedAmount).toBe(1300)
  })

  // Mahsup edilecek hiç borç yoksa, girilen tutarın tamamı dağıtılmadan
  // olduğu gibi geri dönmeli.
  it('açık borç yoksa tüm tutar unallocatedAmount olarak döner', () => {
    const result = allocatePayment({ amount: 500, paidAt: '2026-06-10', openDebts: [], rateSegments })
    expect(result.allocations).toHaveLength(0)
    expect(result.unallocatedAmount).toBe(500)
  })
})
