// FIFO mahsup — bir ödeme tutarını, en eski açık borçtan başlayarak dağıtır.
import { calculatePenalty, roundCurrency, type RateSegment } from './penalty'

export interface OpenDebtForAllocation {
  debtId: number
  /** debts.amount eksi o borca daha önce yapılmış tüm mahsupların toplamı. */
  remainingPrincipal: number
  penaltyStartDate: string | null
}

export interface AllocationResult {
  debtId: number
  principalAmount: number
  penaltyAmount: number
  penaltyDays: number
}

export interface AllocatePaymentParams {
  amount: number
  paidAt: string
  openDebts: OpenDebtForAllocation[]
  rateSegments: RateSegment[]
}

export interface AllocatePaymentResult {
  allocations: AllocationResult[]
  unallocatedAmount: number
}

// Ödemeyi en eski borçtan başlayarak dağıtır, artan varsa unallocatedAmount'ta döner.
export function allocatePayment(params: AllocatePaymentParams): AllocatePaymentResult {
  const { paidAt, openDebts, rateSegments } = params
  let remaining = roundCurrency(params.amount)
  const allocations: AllocationResult[] = []

  for (const debt of openDebts) {
    if (remaining <= 0) break

    const allocate = roundCurrency(Math.min(remaining, debt.remainingPrincipal))
    if (allocate <= 0) continue

    const penalty = calculatePenalty({
      principal: allocate,
      penaltyStartDate: debt.penaltyStartDate,
      asOfDate: paidAt,
      rateSegments
    })

    allocations.push({
      debtId: debt.debtId,
      principalAmount: allocate,
      penaltyAmount: penalty.amount,
      penaltyDays: penalty.days
    })

    remaining = roundCurrency(remaining - allocate)
  }

  return { allocations, unallocatedAmount: remaining }
}
