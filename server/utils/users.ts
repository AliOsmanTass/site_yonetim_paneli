// Kullanıcı yönetimi. seedAdminUser'daki "elle user+account oluştur"
// mantığını burada da kullanıyoruz, çünkü Better Auth'ta kayıt formu kapalı.
import { hashPassword } from 'better-auth/crypto'
import { and, desc, eq, tables, type Database } from './drizzle'
import { seedAdminUser } from './seed'

export interface UserRow {
  id: string
  name: string
  email: string
  role: 'admin' | 'assistant'
  disabled: boolean
  lastLoginAt: string | null
}

// Tüm yönetici hesaplarını, son giriş tarihleriyle birlikte döner.
export async function listUsers(db: Database): Promise<UserRow[]> {
  const users: (typeof tables.user.$inferSelect)[] = await db.select().from(tables.user).orderBy(desc(tables.user.createdAt))

  const sessions = await db.select({ userId: tables.session.userId, createdAt: tables.session.createdAt }).from(tables.session)
  const lastLoginByUser = new Map<string, Date>()
  for (const s of sessions) {
    const current = lastLoginByUser.get(s.userId)
    if (!current || s.createdAt > current) lastLoginByUser.set(s.userId, s.createdAt)
  }

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    disabled: u.disabled,
    lastLoginAt: lastLoginByUser.get(u.id)?.toISOString() ?? null
  }))
}

export interface CreateUserInput {
  name: string
  email: string
  password: string
  role: 'admin' | 'assistant'
}

// Yeni bir yönetici hesabı oluşturur.
export async function createUser(db: Database, input: CreateUserInput): Promise<{ created: boolean }> {
  return seedAdminUser(db, input)
}

// Kullanıcının şifresini değiştirir.
export async function resetPassword(db: Database, userId: string, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword)
  await db
    .update(tables.account)
    .set({ password: passwordHash, updatedAt: new Date() })
    .where(and(eq(tables.account.userId, userId), eq(tables.account.providerId, 'credential')))
}

// Kullanıcıyı pasifleştirir/aktifleştirir.
export async function setDisabled(db: Database, userId: string, disabled: boolean): Promise<void> {
  await db.update(tables.user).set({ disabled, updatedAt: new Date() }).where(eq(tables.user.id, userId))
}
