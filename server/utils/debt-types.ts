// Hazır (sistem) borç türleri.
import { eq, tables, type Database } from './drizzle'

export const SYSTEM_DEBT_TYPE_NAMES = [
  'Aidat',
  'Ortak Alan Sigortası',
  'Araç Etiket Ücreti',
  'Otopark Kullanım Bedeli',
  'Gider Dağıtımı',
  'Demirbaş',
  'Tazminat'
] as const

// Hazır borç türlerinden eksik olanları veritabanına ekler.
export async function ensureSystemDebtTypes(db: Database): Promise<void> {
  const existing: { name: string }[] = await db.select({ name: tables.debtTypes.name }).from(tables.debtTypes)
  const existingNames = new Set(existing.map((row) => row.name))

  for (const name of SYSTEM_DEBT_TYPE_NAMES) {
    if (!existingNames.has(name)) {
      await db.insert(tables.debtTypes).values({ name, isSystem: true })
    }
  }
}

// Tüm borç türlerini (hazır + özel) isme göre sıralı döner.
export async function listDebtTypes(db: Database) {
  await ensureSystemDebtTypes(db)
  return db.select().from(tables.debtTypes).orderBy(tables.debtTypes.name)
}

// Yeni bir özel borç türü ekler, aynı isim varsa onu döner.
export async function createCustomDebtType(db: Database, name: string) {
  const [existing] = await db.select().from(tables.debtTypes).where(eq(tables.debtTypes.name, name))
  if (existing) return existing

  const [created] = await db.insert(tables.debtTypes).values({ name, isSystem: false }).returning()
  return created
}
