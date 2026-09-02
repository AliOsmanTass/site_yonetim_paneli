// Bir dairenin tüm ekstresi + üst özet. Sorgu mantığı
// get-unit-statement.ts'te — açık erişim sayfası aynı fonksiyonu maskeleyerek kullanır.
import { getUnitStatementData } from '../../../../utils/get-unit-statement'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const unitId = Number(getRouterParam(event, 'unitId'))
  if (!unitId) {
    throw createError({ statusCode: 400, statusMessage: 'Geçersiz daire id.' })
  }

  return getUnitStatementData(useDrizzle(), unitId)
})
