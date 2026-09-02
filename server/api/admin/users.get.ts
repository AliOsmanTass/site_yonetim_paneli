// Yönetici hesap listesi. Yardımcı yönetici de görebilir, sadece salt okuma.
import { listUsers } from '../../utils/users'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  return listUsers(useDrizzle())
})
