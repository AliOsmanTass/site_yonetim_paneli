// Gecikme tazminatı hesabı. Saf fonksiyonlar, DB'den bağımsız — penalty.test.ts
// ile doğrulanır. Günlük oran = aylık oran / 30.

// Kuruşa yuvarlar.
export function roundCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

export interface RatePoint {
  rate: number
  /** Bu oranın geçerli olmaya başladığı tarih (YYYY-MM-DD). */
  effectiveFrom: string
}

export interface RateSegment {
  rate: number
  effectiveFrom: string
  /** null ise segment hâlâ geçerli (en güncel oran). */
  effectiveTo: string | null
}

// oran noktalarını aralarında boşluk olmayan kronolojik segmentlere çevirir.
export function buildRateSegments(points: RatePoint[]): RateSegment[] {
  if (points.length === 0) {
    throw new Error('buildRateSegments: en az bir oran noktası gerekli')
  }
  const sorted = [...points].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
  return sorted.map((point, i) => ({
    rate: point.rate,
    effectiveFrom: point.effectiveFrom,
    effectiveTo: sorted[i + 1]?.effectiveFrom ?? null
  }))
}

export interface CalculatePenaltyParams {
  principal: number
  /** Borçta tazminat işlemiyorsa null. */
  penaltyStartDate: string | null
  asOfDate: string
  rateSegments: RateSegment[]
}

export interface PenaltyResult {
  amount: number
  days: number
}

// İki tarih arasındaki gün sayısı.
function daysBetween(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00Z`)
  const toMs = Date.parse(`${to}T00:00:00Z`)
  return Math.round((toMs - fromMs) / 86_400_000)
}

// İki tarihten geç olanı döner.
function maxDate(a: string, b: string): string {
  return a > b ? a : b
}

// İki tarihten erken olanı döner.
function minDate(a: string, b: string): string {
  return a < b ? a : b
}

// Bir borcun tazminatını, gecikme süresini oran segmentlerine bölerek
// hesaplar. Oran ortasında değişse bile her gün doğru oranla sayılır.
export function calculatePenalty(params: CalculatePenaltyParams): PenaltyResult {
  const { principal, penaltyStartDate, asOfDate, rateSegments } = params

  if (!penaltyStartDate || asOfDate <= penaltyStartDate) {
    return { amount: 0, days: 0 }
  }

  let totalAmount = 0
  let totalDays = 0

  rateSegments.forEach((segment, index) => {
    // En eski segmenti geçmişe doğru sınırsız kabul ediyoruz — ondan
    // öncesi için bir oran bilgimiz yok, ama borç daha da eskiden
    // başlamış olabilir.
    const effectiveFrom = index === 0 ? penaltyStartDate : segment.effectiveFrom
    const segmentStart = maxDate(effectiveFrom, penaltyStartDate)
    const segmentEnd = segment.effectiveTo ? minDate(segment.effectiveTo, asOfDate) : asOfDate
    const days = daysBetween(segmentStart, segmentEnd)
    if (days <= 0) return

    totalDays += days
    totalAmount += principal * (segment.rate / 30) * days
  })

  return { amount: roundCurrency(totalAmount), days: totalDays }
}



