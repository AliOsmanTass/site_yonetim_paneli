import { describe, expect, it } from 'vitest'
import { buildStatement, type StatementEvent } from '../../server/utils/statement'

describe('buildStatement', () => {
  // borç ve ödeme kayıtları tarih sırasına dizilip, her satırda
  // o ana kadarki bakiye doğru birikiyor mu.
  it('borç ve ödeme event\'lerini tarihe göre sıralayıp kümülatif bakiye hesaplar', () => {
    const events: StatementEvent[] = [
      {
        kind: 'debt',
        debtId: 1,
        documentDate: '2026-05-02',
        dueDate: '2026-05-09',
        title: '2026/MAYIS DÖNEMİ AİDAT BEDELİ',
        documentNo: '10001',
        amount: 4700
      },
      {
        kind: 'payment',
        paymentId: 1,
        paidAt: '2026-05-09',
        receiptNo: '10002',
        account: 'Garanti Bankası',
        amount: 4700,
        penaltyAmount: 0
      },
      {
        kind: 'debt',
        debtId: 2,
        documentDate: '2026-07-01',
        dueDate: '2026-07-05',
        title: '2026/TEMMUZ DÖNEMİ AİDAT BEDELİ',
        documentNo: '10003',
        amount: 4700
      }
    ]

    const { rows, totals } = buildStatement(events)

    expect(rows.map((r) => r.balance)).toEqual([4700, 0, 4700])
    expect(rows[0]).toMatchObject({ kind: 'debt', title: '2026/MAYIS DÖNEMİ AİDAT BEDELİ', documentNo: '10001' })
    expect(rows[1]).toMatchObject({ kind: 'payment', title: 'Tahsilat', documentNo: '10002', account: 'Garanti Bankası', paymentAmount: 4700, penaltyAmount: null })
    expect(totals).toEqual({ debt: 9400, penalty: 0, payment: 4700, balance: 4700 })
  })

  // Bir ödeme gecikmeli yapılıp tazminat işlemişse, o tazminat tutarı ödeme
  // satırında ve genel toplamda görünmeli.
  it('geç ödemede sabitlenmiş tazminat penaltyAmount satırında görünür', () => {
    const events: StatementEvent[] = [
      { kind: 'debt', debtId: 1, documentDate: '2026-06-01', dueDate: '2026-06-09', title: 'Haziran Aidatı', documentNo: '1', amount: 4700 },
      { kind: 'payment', paymentId: 1, paidAt: '2026-06-29', receiptNo: '2', account: 'Kasa', amount: 4700, penaltyAmount: 219.33 }
    ]

    const { rows, totals } = buildStatement(events)

    expect(rows[1].penaltyAmount).toBe(219.33)
    expect(totals.penalty).toBe(219.33)
    expect(totals.balance).toBe(0)
  })

  // Borç ve ödeme kayıtları veritabanından hangi sırayla gelirse gelsin, ekstre
  // her zaman tarihe göre sıralanmış çıkmalı.
  it('sırasız girdi verilse bile tarihe göre sıralar (evrak tarihi/tahsilat tarihi)', () => {
    const events: StatementEvent[] = [
      { kind: 'payment', paymentId: 1, paidAt: '2026-06-09', receiptNo: '2', account: 'Kasa', amount: 300, penaltyAmount: 0 },
      { kind: 'debt', debtId: 1, documentDate: '2026-06-01', dueDate: '2026-06-05', title: 'Haziran Aidatı', documentNo: '1', amount: 300 }
    ]

    const { rows } = buildStatement(events)
    expect(rows[0].date).toBe('2026-06-01')
    expect(rows[1].date).toBe('2026-06-09')
  })

  // Birden fazla kalemi olan bir borç ekstre satırında
  // kalem detaylarını kaybetmeden taşımalı.
  it('kalemli borçlarda items alt bilgi olarak taşınır', () => {
    const events: StatementEvent[] = [
      {
        kind: 'debt',
        debtId: 1,
        documentDate: '2026-06-01',
        dueDate: '2026-06-08',
        title: '2026-Mayıs Dönemi Gider Dağıtımı',
        documentNo: '1',
        amount: 1296.17,
        items: [
          { description: 'ELEKTRİK 1', quantity: 1, unitPrice: 212.11, lineTotal: 212.11 },
          { description: 'SU', quantity: 1, unitPrice: 3.66, lineTotal: 3.66 }
        ]
      }
    ]

    const { rows } = buildStatement(events)
    expect(rows[0].items).toHaveLength(2)
  })
})
