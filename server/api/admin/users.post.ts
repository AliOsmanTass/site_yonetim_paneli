// Yeni yönetici hesabı ekler — seedAdminUser'la aynı mantığı kullanır,
// çünkü Better Auth'ta kayıt formu kapalı.
import { createUser } from '../../utils/users'

interface CreateUserPayload {
  name: string
  email: string
  password: string
  role: 'admin' | 'assistant'
}

export default defineEventHandler(async (event) => {
  await requireAdminWriteAccess(event)
  const body = await readBody<CreateUserPayload>(event)

  if (!body.name?.trim() || !body.email?.trim() || !body.password || body.password.length < 8 || !body.role) {
    throw createError({ statusCode: 400, statusMessage: 'Ad, e-posta, en az 8 karakterlik şifre ve rol gerekli.' })
  }

  const result = await createUser(useDrizzle(), { name: body.name.trim(), email: body.email.trim(), password: body.password, role: body.role })
  if (!result.created) {
    throw createError({ statusCode: 409, statusMessage: 'Bu e-posta zaten kayıtlı.' })
  }

  return { created: true }
})
