// Bir tutarı eşit paylara böler, kuruş farkı son paya yazılır.
import { roundCurrency } from './penalty'

export function splitEqually(total: number, count: number): number[] {
  if (count <= 0) return []
  const base = roundCurrency(total / count)
  const shares = new Array(count).fill(base)
  const runningSum = roundCurrency(base * (count - 1))
  shares[count - 1] = roundCurrency(total - runningSum)
  return shares
}