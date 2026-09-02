import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { H3Event } from 'h3'
import { useDrizzle } from './drizzle'


function createAuth() {
  return betterAuth({
    database: drizzleAdapter(useDrizzle(), { provider: 'sqlite' }),
    // Sadece e-posta + şifre, kayıt olma kapalı.
    emailAndPassword: {
      enabled: true,
      disableSignUp: true
    },
    user: {
      additionalFields: {
        role: {
          type: 'string',
          defaultValue: 'admin',
          input: false
        },
        // Bu alanı Better Auth'a tanıtmazsak session.user.disabled hep
        // undefined döner ve aşağıdaki kontrol işe yaramaz.
        disabled: {
          type: 'boolean',
          defaultValue: false,
          input: false
        }
      }
    }
  })
}

let _auth: ReturnType<typeof createAuth> | undefined

// Better Auth'u istek anında kuruyoruz
export function serverAuth() {
  if (!_auth) {
    _auth = createAuth()
  }
  return _auth!
}

// Admin API route'larının başında çağrılır.
export async function requireAdminSession(event: H3Event) {
  const headers = new Headers(getHeaders(event) as HeadersInit)
  const session = await serverAuth().api.getSession({ headers })
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  // Pasifleştirilmiş bir hesap yine de giriş yapabilir ama hiçbir admin
  // API'sini kullanamaz — kontrolü tek noktadan burada yaptık
  if (session.user.disabled) {
    throw createError({ statusCode: 403, statusMessage: 'Hesabınız pasifleştirilmiş, yöneticinize başvurun.' })
  }
  return session
}

// (POST/PUT/PATCH/DELETE) endpoint'lerinin başında çağrılır
export async function requireAdminWriteAccess(event: H3Event) {
  const session = await requireAdminSession(event)
  if (session.user.role === 'assistant') {
    throw createError({ statusCode: 403, statusMessage: 'Yardımcı yönetici yalnızca görüntüleyebilir, bu işlemi yapamaz.' })
  }
  return session
}
