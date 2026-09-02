// Yönetici özetindeki gösterge kartları. DB'de saklanmaz, her istekte
// canlı hesaplanır. Açık erişimli anasayfa da bu fonksiyonu kullanır.
import { and, eq, lt, sql, tables, type Database } from './drizzle'

export interface DashboardSummary {
  unitCount: number
  unpaidUnitCount: number
  unpaidDuesCount: number
  totalDuesDebt: number
}

// Gösterge kartlarının 4 sayısını hesaplar: daire sayısı, borçlu daire, borçlu ay, toplam borç.
export async function getDashboardSummary(db: Database): Promise<DashboardSummary> {
  // Aktif/pasif daire ayrımı yok, tüm gerçek daireler sayılır. 
  const [{ unitCount }] = await db
    .select({ unitCount: sql<number>`COUNT(*)` })
    .from(tables.units)
    .where(eq(tables.units.isVirtual, false))

  const [aidatType] = await db.select().from(tables.debtTypes).where(eq(tables.debtTypes.name, 'Aidat'))
  if (!aidatType) {
    // Henüz hiç aidat tahakkuku çalışmadı (yeni kurulmuş site) — hata
    // vermek yerine sıfır dönüyoruz.
    return { unitCount, unpaidUnitCount: 0, unpaidDuesCount: 0, totalDuesDebt: 0 }
  }

  const today = new Date().toISOString().slice(0, 10)
  // Korele alt sorgu yerine LEFT JOIN + GROUP BY kullanıyoruz
  const overdueDebts: { unitId: number; amount: number; allocated: number }[] = await db
    .select({
      unitId: tables.debts.unitId,
      amount: tables.debts.amount,
      allocated: sql<number>`COALESCE(SUM(${tables.paymentAllocations.principalAmount}), 0)`
    })
    .from(tables.debts)
    .leftJoin(tables.paymentAllocations, eq(tables.paymentAllocations.debtId, tables.debts.id))
    .where(and(eq(tables.debts.debtTypeId, aidatType.id), sql`${tables.debts.status} != 'paid'`, lt(tables.debts.dueDate, today)))
    .groupBy(tables.debts.id)

  const openDebts: { unitId: number; remaining: number }[] = overdueDebts
    .map((d) => ({ unitId: d.unitId, remaining: d.amount - d.allocated }))
    .filter((d) => d.remaining > 0)

  let totalDuesDebt = 0
  const unpaidUnitIds = new Set<number>()
  for (const d of openDebts) {
    unpaidUnitIds.add(d.unitId)
    totalDuesDebt += d.remaining
  }

  return {
    unitCount,
    unpaidUnitCount: unpaidUnitIds.size,
    unpaidDuesCount: openDebts.length,
    totalDuesDebt
  }
}
