// Kullanıcıyı pasifleştirir/aktifleştirir. Kendi hesabını pasifleştirmek
// yasak — yanlışlıkla kendini kilitlememesi için.
import { setDisabled } from '../../utils/users'

interface ToggleDisabledPayload {
  userId: string
  disabled: boolean
}

export default defineEventHandler(async (event) => {
  const session = await requireAdminWriteAccess(event)
  const body = await readBody<ToggleDisabledPayload>(event)

  if (!body.userId || typeof body.disabled !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'Kullanıcı ve durum gerekli.' })
  }
  if (body.userId === session.user.id && body.disabled) {
    throw createError({ statusCode: 400, statusMessage: 'Kendi hesabınızı pasifleştiremezsiniz.' })
  }

  await setDisabled(useDrizzle(), body.userId, body.disabled)
  return { success: true }
})
