// İlk admin kullanıcısını oluşturur. Better Auth'ta kayıt formu kapalı
// olduğu için, kayıt işleminin yaptığını (aynı hashPassword fonksiyonu,
// aynı user/account satırları) burada elle yapıyoruz.
import { hashPassword } from 'better-auth/crypto'
import { eq, tables, type Database } from './drizzle'

export interface SeedAdminParams {
  email: string
  password: string
  name: string
  role?: 'admin' | 'assistant'
}

export async function seedAdminUser(db: Database, params: SeedAdminParams): Promise<{ created: boolean }> {
  const [existing] = await db.select({ id: tables.user.id }).from(tables.user).where(eq(tables.user.email, params.email))
  if (existing) {
    return { created: false }
  }

  const userId = crypto.randomUUID()
  const passwordHash = await hashPassword(params.password)
  const now = new Date()

  await db.insert(tables.user).values({
    id: userId,
    name: params.name,
    email: params.email,
    emailVerified: false,
    role: params.role ?? 'admin',
    createdAt: now,
    updatedAt: now
  })

  await db.insert(tables.account).values({
    id: crypto.randomUUID(),
    accountId: userId,
    providerId: 'credential',
    userId,
    password: passwordHash,
    createdAt: now,
    updatedAt: now
  })

  return { created: true }
}
