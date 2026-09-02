// Kullanıcı şifresini sıfırlar. 
import { resetPassword } from '../../utils/users'

interface ResetPasswordPayload {
  userId: string
  password: string
}

export default defineEventHandler(async (event) => {
  await requireAdminWriteAccess(event)
  const body = await readBody<ResetPasswordPayload>(event)

  if (!body.userId || !body.password || body.password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'Kullanıcı ve en az 8 karakterlik şifre gerekli.' })
  }

  await resetPassword(useDrizzle(), body.userId, body.password)
  return { success: true }
})
