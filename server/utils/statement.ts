// Bir dairenin borç/ödeme olayları
import { roundCurrency } from './penalty'

export interface StatementItem {
  description: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface StatementDebtEvent {
  kind: 'debt'
  debtId: number
  documentDate: string
  /** Borç satırlarında vade tarihi olarak gösterilir. */
  dueDate: string
  title: string
  documentNo: string
  amount: number
  debtTypeName?: string
  items?: StatementItem[]
}

export interface StatementPaymentEvent {
  kind: 'payment'
  paymentId: number
  paidAt: string
  receiptNo: string
  account: string
  amount: number
  /** Bu ödemenin kapattığı borçlar için sabitlenmiş toplam tazminat. */
  penaltyAmount: number
}

export type StatementEvent = StatementDebtEvent | StatementPaymentEvent

export interface StatementRow {
  /** Borç ya da ödeme kaydının kendi id'si, düzenle/sil gibi aksiyonlar için. */
  id: number
  date: string
  dueDate: string
  kind: 'debt' | 'payment'
  title: string
  documentNo: string
  /** Sadece ödeme satırlarında dolu — kasa/hesap adı. */
  account?: string
  /** Sadece borç satırlarında dolu — örn. "Demirbaş". */
  debtTypeName?: string
  debtAmount: number | null
  penaltyAmount: number | null
  paymentAmount: number | null
  balance: number
  items?: StatementItem[]
}

export interface StatementTotals {
  debt: number
  penalty: number
  payment: number
  balance: number
}

// Bir olayın sıralamada kullanılacak tarihini döner.
function eventDate(event: StatementEvent): string {
  return event.kind === 'debt' ? event.documentDate : event.paidAt
}

// Borç/ödeme olaylarını tarihe sıralar, her satıra kümülatif bakiye ekler.
export function buildStatement(events: StatementEvent[]): { rows: StatementRow[]; totals: StatementTotals } {
  const sorted = [...events].sort((a, b) => eventDate(a).localeCompare(eventDate(b)))

  let balance = 0
  const rows: StatementRow[] = sorted.map((event) => {
    if (event.kind === 'debt') {
      balance = roundCurrency(balance + event.amount)
      return {
        id: event.debtId,
        date: event.documentDate,
        dueDate: event.dueDate,
        kind: 'debt',
        title: event.title,
        documentNo: event.documentNo,
        debtTypeName: event.debtTypeName,
        debtAmount: event.amount,
        penaltyAmount: null,
        paymentAmount: null,
        balance,
        items: event.items
      }
    }

    balance = roundCurrency(balance - event.amount)
    return {
      id: event.paymentId,
      date: event.paidAt,
      dueDate: event.paidAt,
      kind: 'payment',
      title: 'Tahsilat',
      documentNo: event.receiptNo,
      account: event.account,
      debtAmount: null,
      penaltyAmount: event.penaltyAmount > 0 ? event.penaltyAmount : null,
      paymentAmount: event.amount,
      balance
    }
  })

  const totals: StatementTotals = {
    debt: roundCurrency(rows.reduce((sum, r) => sum + (r.debtAmount ?? 0), 0)),
    penalty: roundCurrency(rows.reduce((sum, r) => sum + (r.penaltyAmount ?? 0), 0)),
    payment: roundCurrency(rows.reduce((sum, r) => sum + (r.paymentAmount ?? 0), 0)),
    balance
  }

  return { rows, totals }
}
